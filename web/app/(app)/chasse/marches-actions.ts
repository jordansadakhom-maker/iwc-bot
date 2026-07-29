"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getActeur } from "@/lib/authz";

// Écritures du module « Villes & Marchés ». TOUTES réservées à la Direction
// (fail-closed) ; la lecture (getMarchesChasse) reste ouverte à tous.
export type MarcheResult = { ok: boolean; error?: string };

function nid(p: string) { return `${p}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`; }
const s = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
const r2 = (n: number) => Math.round(n * 100) / 100;

type Admin = NonNullable<ReturnType<typeof createAdminClient>>;
async function garde(): Promise<{ admin: Admin; nom: string } | MarcheResult> {
  const acteur = await getActeur();
  if (!acteur || !acteur.officier) return { ok: false, error: "Réservé aux officiers et à la Direction." };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service indisponible." };
  return { admin, nom: acteur.nomIC || "Direction" };
}
const tableAbsente = (msg: string) => /does not exist|relation|schema cache|Chasse(Ville|RessourceMarche|MarchePrix)/i.test(msg);
const errTable = (msg: string): MarcheResult => tableAbsente(msg)
  ? { ok: false, error: "Le module Marchés n'est pas prêt côté base — lance chasse-marches.sql dans Supabase." }
  : { ok: false, error: "Enregistrement impossible pour le moment." };

// ── Villes ──
export async function creerVilleMarche(nom: string): Promise<MarcheResult> {
  const g = await garde(); if ("ok" in g) return g;
  const n = s(nom, 60); if (!n) return { ok: false, error: "Nom de ville requis." };
  const { data: max } = await g.admin.from("ChasseVille").select("ordre").order("ordre", { ascending: false }).limit(1).maybeSingle();
  const ordre = ((max as { ordre?: number } | null)?.ordre ?? 0) + 1;
  const { error } = await g.admin.from("ChasseVille").insert({ id: nid("vil"), nom: n, actif: true, ordre });
  return error ? errTable(error.message) : { ok: true };
}
export async function renommerVilleMarche(id: string, nom: string): Promise<MarcheResult> {
  const g = await garde(); if ("ok" in g) return g;
  const n = s(nom, 60); if (!id || !n) return { ok: false, error: "Ville ou nom manquant." };
  const { error } = await g.admin.from("ChasseVille").update({ nom: n }).eq("id", id);
  return error ? errTable(error.message) : { ok: true };
}
export async function basculerVilleMarche(id: string, actif: boolean): Promise<MarcheResult> {
  const g = await garde(); if ("ok" in g) return g;
  if (!id) return { ok: false, error: "Ville introuvable." };
  const { error } = await g.admin.from("ChasseVille").update({ actif: !!actif }).eq("id", id);
  return error ? errTable(error.message) : { ok: true };
}
export async function supprimerVilleMarche(id: string): Promise<MarcheResult> {
  const g = await garde(); if ("ok" in g) return g;
  if (!id) return { ok: false, error: "Ville introuvable." };
  await g.admin.from("ChasseMarchePrix").delete().eq("villeId", id);
  const { error } = await g.admin.from("ChasseVille").delete().eq("id", id);
  return error ? errTable(error.message) : { ok: true };
}

// ── Ressources (catalogue Légal / Illégal) ──
export async function creerRessourceMarche(nom: string, categorie: "legal" | "illegal"): Promise<MarcheResult> {
  const g = await garde(); if ("ok" in g) return g;
  const n = s(nom, 80); if (!n) return { ok: false, error: "Nom de ressource requis." };
  const cat = categorie === "illegal" ? "illegal" : "legal";
  const { data: max } = await g.admin.from("ChasseRessourceMarche").select("ordre").order("ordre", { ascending: false }).limit(1).maybeSingle();
  const ordre = ((max as { ordre?: number } | null)?.ordre ?? 0) + 1;
  const { error } = await g.admin.from("ChasseRessourceMarche").insert({ id: nid("rmk"), nom: n, categorie: cat, ordre });
  if (error && /duplicate|unique/i.test(error.message)) return { ok: false, error: "Cette ressource existe déjà." };
  return error ? errTable(error.message) : { ok: true };
}
export async function supprimerRessourceMarche(id: string, nom: string): Promise<MarcheResult> {
  const g = await garde(); if ("ok" in g) return g;
  if (!id) return { ok: false, error: "Ressource introuvable." };
  if (nom) await g.admin.from("ChasseMarchePrix").delete().eq("ressource", s(nom, 80));
  const { error } = await g.admin.from("ChasseRessourceMarche").delete().eq("id", id);
  return error ? errTable(error.message) : { ok: true };
}

// ── Prix (upsert + historique avant→après) ──
export async function definirPrixMarche(input: { villeId: string; villeNom: string; ressource: string; prix: number }): Promise<MarcheResult> {
  const g = await garde(); if ("ok" in g) return g;
  const villeId = s(input.villeId, 40); const ressource = s(input.ressource, 80);
  if (!villeId || !ressource) return { ok: false, error: "Ville ou ressource manquante." };
  const prix = Math.max(0, r2(Number(input.prix) || 0));

  const { data: ex } = await g.admin.from("ChasseMarchePrix").select("id,prix").eq("villeId", villeId).eq("ressource", ressource).maybeSingle();
  const ancien = ex ? Number((ex as { prix: number }).prix) || 0 : null;

  let err: string | undefined;
  if (ex) {
    const { error } = await g.admin.from("ChasseMarchePrix").update({ prix, updatedAt: new Date().toISOString() }).eq("id", (ex as { id: string }).id);
    err = error?.message;
  } else {
    const { error } = await g.admin.from("ChasseMarchePrix").insert({ id: nid("prx"), villeId, ressource, prix, updatedAt: new Date().toISOString() });
    err = error?.message;
  }
  if (err) return errTable(err);

  // Historique — best-effort (ne bloque jamais l'enregistrement du prix).
  try {
    await g.admin.from("ChasseMarcheHistorique").insert({
      id: nid("hmk"), villeId, ville: s(input.villeNom, 60), ressource, ancien, nouveau: prix, par: g.nom, createdAt: new Date().toISOString(),
    });
  } catch { /* table historique absente → on ignore */ }
  return { ok: true };
}
