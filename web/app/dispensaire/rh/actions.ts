"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionProfile } from "@/lib/queries";
import { peutGererRH } from "@/lib/dispensaire-roles";
import { emettreEvenementDispensaire } from "@/lib/dispensaire-evenements";
import { cleNom } from "@/lib/noms";

// RH du Dispensaire — écriture réservée aux membres habilités (direction/médecin).
export type RhResult = { ok: boolean; error?: string; id?: string };

type Champ = "nom" | "grade" | "qualifications" | "dateEmbauche" | "compteBancaire" | "telegramme" | "statut" | "notes" | "dateDepart" | "motifDepart";
const CHAMPS: Champ[] = ["nom", "grade", "qualifications", "dateEmbauche", "compteBancaire", "telegramme", "statut", "notes", "dateDepart", "motifDepart"];
const STATUTS = ["actif", "suspendu", "renvoye", "demission"];

const s = (v: unknown, max = 500) => { const t = String(v ?? "").trim(); return t ? t.slice(0, max) : null; };
function newId() { return `ds-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`; }

// Sécurité automatique (refonte « fiche Personnel ») : un salarié passé « renvoyé »
// perd son accès au site. On désactive la (ou les) fiche(s) DispensaireMembre
// correspondant à son nom. Best-effort : la fiche RH reste enregistrée même si
// la coupure échoue (elle peut être faite à la main depuis l'Administration).
async function couperAccesDe(admin: NonNullable<ReturnType<typeof createAdminClient>>, nom: string | null | undefined): Promise<void> {
  try {
    const cle = cleNom(nom);
    if (!cle) return;
    const { data } = await admin.from("DispensaireMembre").select("id,nom,actif");
    for (const m of ((data as { id: string; nom: string; actif: boolean | null }[]) || [])) {
      if (m.actif !== false && cleNom(m.nom) === cle) await admin.from("DispensaireMembre").update({ actif: false }).eq("id", m.id);
    }
  } catch { /* la coupure reste faisable à la main */ }
}
// Fail-closed : réservé aux grades porteurs du droit « rh » (ou admin).
async function autorise() { return peutGererRH(); }
async function qui() { try { return (await getSessionProfile())?.nom || "Équipe"; } catch { return "Équipe"; } }
// Lit une fiche salarié (best-effort) pour capturer l'« avant » du journal d'audit.
async function lire(admin: NonNullable<ReturnType<typeof createAdminClient>>, id: string): Promise<Record<string, unknown> | null> {
  try { const { data } = await admin.from("DispensaireSalarie").select("*").eq("id", id).maybeSingle(); return (data as Record<string, unknown>) ?? null; } catch { return null; }
}

function nettoyer(data: Record<string, unknown>) {
  const row: Record<string, unknown> = {};
  for (const c of CHAMPS) if (c in data) {
    if (c === "statut") row[c] = STATUTS.includes(String(data[c])) ? data[c] : "actif";
    else if (c === "dateEmbauche" || c === "dateDepart") { const d = s(data[c], 20); row[c] = d && /^\d{4}-\d{2}-\d{2}/.test(d) ? d.slice(0, 10) : null; }
    else row[c] = s(data[c], c === "notes" || c === "qualifications" ? 2000 : 200);
  }
  return row;
}

export async function creerSalarie(data: Record<string, unknown>): Promise<RhResult> {
  if (!(await autorise())) return { ok: false, error: "Réservé aux membres habilités." };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  const row = nettoyer(data);
  if (!row.nom) return { ok: false, error: "Donne le nom du salarié." };
  const id = newId();
  const { error } = await admin.from("DispensaireSalarie").insert({ id, ...row, updatedBy: await qui(), updatedAt: new Date().toISOString() });
  if (error) return { ok: false, error: "Création impossible (la table existe-t-elle ?)." };
  await emettreEvenementDispensaire({ aggregate: "salarie", type: "salarie.cree", cibleId: id, cibleLibelle: String(row.nom ?? ""), apres: row });
  return { ok: true, id };
}

export async function majSalarie(id: string, patch: Record<string, unknown>): Promise<RhResult> {
  if (!(await autorise())) return { ok: false, error: "Réservé aux membres habilités." };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  if (!id) return { ok: false, error: "Salarié introuvable." };
  const row = nettoyer(patch);
  if ("nom" in row && !row.nom) return { ok: false, error: "Le nom ne peut pas être vide." };
  if (!Object.keys(row).length) return { ok: true };
  const avant = await lire(admin, id);
  const { error } = await admin.from("DispensaireSalarie").update({ ...row, updatedBy: await qui(), updatedAt: new Date().toISOString() }).eq("id", id);
  if (error) return { ok: false, error: "Enregistrement impossible." };
  await emettreEvenementDispensaire({ aggregate: "salarie", type: "salarie.maj", cibleId: id, cibleLibelle: String((avant?.nom ?? row.nom) ?? ""), avant, apres: row });
  // Le passage en « renvoyé » ou « démissionnaire » coupe l'accès au site dans la foulée.
  if (String(patch.statut ?? "") === "renvoye" || String(patch.statut ?? "") === "demission") {
    const nom = (row.nom as string | null | undefined) ?? (avant?.nom as string | null | undefined);
    await couperAccesDe(admin, nom);
  }
  return { ok: true };
}

// Marque un salarié comme PARTI (renvoi ou démission) : statut + date de départ
// (automatique) + motif facultatif, et coupe l'accès au site. Réservé RH/Direction.
// Repli tolérant si la base n'a pas encore les colonnes dateDepart/motifDepart.
export async function marquerDepart(id: string, type: "renvoye" | "demission", motif?: string): Promise<RhResult> {
  if (!(await autorise())) return { ok: false, error: "Réservé aux membres habilités." };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  if (!id) return { ok: false, error: "Salarié introuvable." };
  if (type !== "renvoye" && type !== "demission") return { ok: false, error: "Type de départ invalide." };
  const avant = await lire(admin, id);
  const dateDepart = new Date().toISOString().slice(0, 10);
  const mtf = s(motif, 500);
  const meta = { updatedBy: await qui(), updatedAt: new Date().toISOString() };
  let { error } = await admin.from("DispensaireSalarie").update({ statut: type, dateDepart, motifDepart: mtf, ...meta }).eq("id", id);
  if (error) {
    // Base pas encore migrée (colonnes de départ absentes) → au moins le statut.
    ({ error } = await admin.from("DispensaireSalarie").update({ statut: type, ...meta }).eq("id", id));
  }
  if (error) return { ok: false, error: "Enregistrement impossible (lance dispensaire-rh.sql ?)." };
  const nom = (avant?.nom as string | null | undefined) ?? null;
  await couperAccesDe(admin, nom); // départ → accès au site coupé (best-effort)
  await emettreEvenementDispensaire({
    aggregate: "salarie", type: type === "renvoye" ? "salarie.renvoi" : "salarie.demission",
    cibleId: id, cibleLibelle: String(nom ?? ""),
    avant: { statut: avant?.statut ?? "actif" }, apres: { statut: type, dateDepart, motif: mtf },
  });
  return { ok: true };
}

export async function supprimerSalarie(id: string): Promise<RhResult> {
  if (!(await autorise())) return { ok: false, error: "Réservé aux membres habilités." };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  const avant = await lire(admin, id);
  const { error } = await admin.from("DispensaireSalarie").delete().eq("id", id);
  if (error) return { ok: false, error: "Suppression impossible." };
  await emettreEvenementDispensaire({ aggregate: "salarie", type: "salarie.supprime", cibleId: id, cibleLibelle: String(avant?.nom ?? ""), avant });
  return { ok: true };
}

// Ajuste un compteur d'absences (type 'j' = justifiée, 'i' = injustifiée).
export async function ajusterAbsence(id: string, type: "j" | "i", delta: number): Promise<RhResult> {
  if (!(await autorise())) return { ok: false, error: "Réservé aux membres habilités." };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  const col = type === "i" ? "absInjustifiees" : "absJustifiees";
  const { data: ex } = await admin.from("DispensaireSalarie").select(`id,${col}`).eq("id", id).maybeSingle();
  if (!ex) return { ok: false, error: "Salarié introuvable." };
  const cur = Number((ex as Record<string, unknown>)[col]) || 0;
  const val = Math.max(0, cur + Math.round(delta));
  const { error } = await admin.from("DispensaireSalarie").update({ [col]: val, updatedAt: new Date().toISOString() }).eq("id", id);
  if (error) return { ok: false, error: "Enregistrement impossible." };
  await emettreEvenementDispensaire({ aggregate: "salarie", type: "salarie.absence", cibleId: id, avant: { [col]: cur }, apres: { [col]: val } });
  return { ok: true };
}
