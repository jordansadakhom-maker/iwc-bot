"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionProfile } from "@/lib/queries";
import { estAutorise } from "@/lib/dispensaire-roles";
import type { Besoin, Passage } from "@/lib/dispensaire-charrettes-const";

// Charrettes — suivi du matériel roulant (site-native, écriture directe).
export type ChrResult = { ok: boolean; error?: string; id?: string };

const REFUS = "Accès refusé.";
const s = (v: unknown, max = 300) => { const t = String(v ?? "").trim(); return t ? t.slice(0, max) : null; };
function newId(p: string) { return `${p}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`; }
async function qui() { try { return (await getSessionProfile())?.nom || "Équipe"; } catch { return "Équipe"; } }
// « AAAA-MM-JJ » → ISO à midi (évite tout décalage de jour selon le fuseau).
function dateIso(v: unknown): string | null {
  const t = String(v ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}/.test(t)) return null;
  const d = new Date(`${t.slice(0, 10)}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
function arr<T>(v: unknown): T[] { return Array.isArray(v) ? (v as T[]) : []; }
async function lire(admin: NonNullable<ReturnType<typeof createAdminClient>>, id: string) {
  const { data } = await admin.from("DispensaireCharrette").select("*").eq("id", id).maybeSingle();
  return data as Record<string, unknown> | null;
}

export async function creerCharrette(data: Record<string, unknown>): Promise<ChrResult> {
  if (!(await estAutorise())) return { ok: false, error: REFUS };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  const nom = s(data.nom, 120);
  if (!nom) return { ok: false, error: "Donne un nom à la charrette." };
  const id = newId("chr");
  const now = new Date().toISOString();
  const detenteur = s(data.detenteur, 120);
  const dateReception = detenteur ? (dateIso(data.dateReception) || now) : null;
  const { error } = await admin.from("DispensaireCharrette").insert({ id, nom, detenteur, dateReception, note: s(data.note, 500), besoins: [], historique: [], createdAt: now, updatedAt: now });
  if (error) return { ok: false, error: "Création impossible (la table DispensaireCharrette existe-t-elle ?)." };
  return { ok: true, id };
}

export async function majCharrette(id: string, patch: Record<string, unknown>): Promise<ChrResult> {
  if (!(await estAutorise())) return { ok: false, error: REFUS };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  if (!id) return { ok: false, error: "Charrette introuvable." };
  const row: Record<string, unknown> = {};
  if ("nom" in patch) { const n = s(patch.nom, 120); if (!n) return { ok: false, error: "Le nom ne peut pas être vide." }; row.nom = n; }
  if ("note" in patch) row.note = s(patch.note, 500);
  if (!Object.keys(row).length) return { ok: true };
  const { error } = await admin.from("DispensaireCharrette").update({ ...row, updatedAt: new Date().toISOString() }).eq("id", id);
  if (error) return { ok: false, error: "Enregistrement impossible." };
  return { ok: true };
}

// Attribue / change le détenteur. Le détenteur précédent (s'il y en a un) est
// versé à l'historique avec sa date de retour → on sait toujours qui l'avait avant.
export async function assignerCharrette(id: string, detenteurNom: string, dateReceptionStr?: string): Promise<ChrResult> {
  if (!(await estAutorise())) return { ok: false, error: REFUS };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  const det = s(detenteurNom, 120);
  if (!det) return { ok: false, error: "Indique le détenteur." };
  const c = await lire(admin, id);
  if (!c) return { ok: false, error: "Charrette introuvable." };
  const now = new Date().toISOString();
  const historique = arr<Passage>(c.historique);
  if (c.detenteur) historique.push({ detenteur: String(c.detenteur), dateReception: c.dateReception ? String(c.dateReception) : null, dateRetour: now, par: await qui() });
  const dateReception = dateIso(dateReceptionStr) || now;
  const { error } = await admin.from("DispensaireCharrette").update({ detenteur: det, dateReception, historique, updatedAt: now }).eq("id", id);
  if (error) return { ok: false, error: "Enregistrement impossible." };
  return { ok: true };
}

// Rendue au dispensaire : le détenteur courant passe à l'historique, la charrette
// redevient disponible.
export async function rendreCharrette(id: string): Promise<ChrResult> {
  if (!(await estAutorise())) return { ok: false, error: REFUS };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  const c = await lire(admin, id);
  if (!c) return { ok: false, error: "Charrette introuvable." };
  if (!c.detenteur) return { ok: true };
  const now = new Date().toISOString();
  const historique = arr<Passage>(c.historique);
  historique.push({ detenteur: String(c.detenteur), dateReception: c.dateReception ? String(c.dateReception) : null, dateRetour: now, par: await qui() });
  const { error } = await admin.from("DispensaireCharrette").update({ detenteur: null, dateReception: null, historique, updatedAt: now }).eq("id", id);
  if (error) return { ok: false, error: "Enregistrement impossible." };
  return { ok: true };
}

// Signale un besoin : qui en a besoin et quand.
export async function ajouterBesoin(id: string, nomStr: string, quandStr?: string): Promise<ChrResult> {
  if (!(await estAutorise())) return { ok: false, error: REFUS };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  const nom = s(nomStr, 120);
  if (!nom) return { ok: false, error: "Indique qui en a besoin." };
  const c = await lire(admin, id);
  if (!c) return { ok: false, error: "Charrette introuvable." };
  const besoins = arr<Besoin>(c.besoins);
  besoins.push({ id: newId("bes"), nom, quand: s(quandStr, 120), par: await qui(), at: new Date().toISOString() });
  const { error } = await admin.from("DispensaireCharrette").update({ besoins, updatedAt: new Date().toISOString() }).eq("id", id);
  if (error) return { ok: false, error: "Enregistrement impossible." };
  return { ok: true };
}

export async function retirerBesoin(id: string, besoinId: string): Promise<ChrResult> {
  if (!(await estAutorise())) return { ok: false, error: REFUS };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  const c = await lire(admin, id);
  if (!c) return { ok: false, error: "Charrette introuvable." };
  const besoins = arr<Besoin>(c.besoins).filter((b) => b.id !== besoinId);
  const { error } = await admin.from("DispensaireCharrette").update({ besoins, updatedAt: new Date().toISOString() }).eq("id", id);
  if (error) return { ok: false, error: "Enregistrement impossible." };
  return { ok: true };
}

export async function supprimerCharrette(id: string): Promise<ChrResult> {
  if (!(await estAutorise())) return { ok: false, error: REFUS };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  const { error } = await admin.from("DispensaireCharrette").delete().eq("id", id);
  if (error) return { ok: false, error: "Suppression impossible." };
  return { ok: true };
}
