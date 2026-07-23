"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionProfile } from "@/lib/queries";
import { getRoleDispensaire, getGrades } from "@/lib/dispensaire-roles";
import { CONFIG_DEFAUT } from "@/lib/dispensaire-roles-const";

// Panneau d'administration — réservé aux rôles disposant de la permission `admin`.
export type AdminResult = { ok: boolean; error?: string; id?: string };

const s = (v: unknown, max = 200) => { const t = String(v ?? "").trim(); return t ? t.slice(0, max) : null; };
function newId() { return `dme-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`; }
function newGradeId() { return `grd-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`; }
async function autorise() { try { return (await getRoleDispensaire()).perms.admin; } catch { return false; } }
async function qui() { try { return (await getSessionProfile())?.nom || "Équipe"; } catch { return "Équipe"; } }
// Valide une clé de grade contre les grades EXISTANTS (repli sur le plus bas).
async function validRole(role: unknown): Promise<string> {
  const grades = await getGrades();
  const k = String(role ?? "");
  if (grades.some((g) => g.key === k)) return k;
  return grades[grades.length - 1]?.key || "apprenti";
}

export async function creerMembre(data: Record<string, unknown>): Promise<AdminResult> {
  if (!(await autorise())) return { ok: false, error: "Réservé à l'administration du dispensaire." };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  const nom = s(data.nom);
  if (!nom) return { ok: false, error: "Donne le nom du membre." };
  const role = await validRole(data.role);
  const id = newId();
  const now = new Date().toISOString();
  const { error } = await admin.from("DispensaireMembre").insert({ id, nom, identifiant: s(data.identifiant), role, actif: data.actif === false ? false : true, note: s(data.note, 500), updatedBy: await qui(), updatedAt: now });
  return error ? { ok: false, error: "Création impossible (la table existe-t-elle ?)." } : { ok: true, id };
}

export async function majMembre(id: string, patch: Record<string, unknown>): Promise<AdminResult> {
  if (!(await autorise())) return { ok: false, error: "Réservé à l'administration du dispensaire." };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  if (!id) return { ok: false, error: "Membre introuvable." };
  const row: Record<string, unknown> = {};
  if ("nom" in patch) { const n = s(patch.nom); if (!n) return { ok: false, error: "Le nom ne peut pas être vide." }; row.nom = n; }
  if ("identifiant" in patch) row.identifiant = s(patch.identifiant);
  if ("role" in patch) row.role = await validRole(patch.role);
  if ("actif" in patch) row.actif = Boolean(patch.actif);
  if ("note" in patch) row.note = s(patch.note, 500);
  if (!Object.keys(row).length) return { ok: true };
  const { error } = await admin.from("DispensaireMembre").update({ ...row, updatedBy: await qui(), updatedAt: new Date().toISOString() }).eq("id", id);
  return error ? { ok: false, error: "Enregistrement impossible." } : { ok: true };
}

export async function supprimerMembre(id: string): Promise<AdminResult> {
  if (!(await autorise())) return { ok: false, error: "Réservé à l'administration du dispensaire." };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  const { error } = await admin.from("DispensaireMembre").delete().eq("id", id);
  return error ? { ok: false, error: "Suppression impossible." } : { ok: true };
}

// Enregistre des paramètres (clé → valeur numérique).
export async function majConfig(patch: Record<string, number>): Promise<AdminResult> {
  if (!(await autorise())) return { ok: false, error: "Réservé à l'administration du dispensaire." };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  const now = new Date().toISOString();
  const par = await qui();
  const rows = Object.entries(patch)
    .filter(([k]) => k in CONFIG_DEFAUT)
    .map(([cle, v]) => ({ cle, valeur: String(Math.max(0, Math.round(Number(v) || 0))), updatedBy: par, updatedAt: now }));
  if (!rows.length) return { ok: true };
  const { error } = await admin.from("DispensaireConfig").upsert(rows, { onConflict: "cle" });
  return error ? { ok: false, error: "Enregistrement impossible (la table existe-t-elle ?)." } : { ok: true };
}

// ── Grades & permissions ────────────────────────────────────────────────────
// Les grades sont pilotables depuis l'admin : créer, renommer, régler les
// droits, réordonner, supprimer. `voir` est toujours acquis (non stocké).
const PERM_KEYS = ["admin", "rh", "factures", "stock", "medical"] as const;

export async function creerGrade(data: Record<string, unknown>): Promise<AdminResult> {
  if (!(await autorise())) return { ok: false, error: "Réservé à l'administration du dispensaire." };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  const nom = s(data.nom, 60);
  if (!nom) return { ok: false, error: "Donne le nom du grade." };
  const grades = await getGrades();
  // Nouveau grade au plus bas de la hiérarchie par défaut (droits à activer ensuite).
  const ordre = grades.length ? Math.min(...grades.map((g) => g.rang)) - 1 : 1;
  const id = newGradeId();
  const row: Record<string, unknown> = { id, nom, ordre, updatedBy: await qui(), updatedAt: new Date().toISOString() };
  for (const k of PERM_KEYS) row[k] = Boolean(data[k]);
  const { error } = await admin.from("DispensaireGrade").insert(row);
  return error ? { ok: false, error: "Création impossible (lance dispensaire-grades.sql ?)." } : { ok: true, id };
}

export async function majGrade(id: string, patch: Record<string, unknown>): Promise<AdminResult> {
  if (!(await autorise())) return { ok: false, error: "Réservé à l'administration du dispensaire." };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  if (!id) return { ok: false, error: "Grade introuvable." };
  const row: Record<string, unknown> = {};
  if ("nom" in patch) { const n = s(patch.nom, 60); if (!n) return { ok: false, error: "Le nom du grade ne peut pas être vide." }; row.nom = n; }
  for (const k of PERM_KEYS) if (k in patch) row[k] = Boolean(patch[k]);
  if (!Object.keys(row).length) return { ok: true };
  // Anti-verrouillage : ne pas retirer le droit admin au dernier grade qui l'a.
  if ("admin" in row && row.admin === false) {
    const grades = await getGrades();
    const admins = grades.filter((g) => g.perms.admin);
    if (admins.length <= 1 && admins[0]?.key === id) return { ok: false, error: "Impossible : c'est le dernier grade administrateur." };
  }
  const { error } = await admin.from("DispensaireGrade").update({ ...row, updatedBy: await qui(), updatedAt: new Date().toISOString() }).eq("id", id);
  return error ? { ok: false, error: "Enregistrement impossible." } : { ok: true };
}

export async function supprimerGrade(id: string): Promise<AdminResult> {
  if (!(await autorise())) return { ok: false, error: "Réservé à l'administration du dispensaire." };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  if (!id) return { ok: false, error: "Grade introuvable." };
  // Interdit si des membres portent encore ce grade → à réaffecter d'abord.
  const { data: used } = await admin.from("DispensaireMembre").select("id").eq("role", id).limit(1);
  if (used && used.length) return { ok: false, error: "Des membres portent encore ce grade — réaffecte-les avant de le supprimer." };
  // Anti-verrouillage : ne pas supprimer le dernier grade administrateur.
  const grades = await getGrades();
  const cible = grades.find((g) => g.key === id);
  if (cible?.perms.admin && grades.filter((g) => g.perms.admin).length <= 1) return { ok: false, error: "Impossible de supprimer le dernier grade administrateur." };
  const { error } = await admin.from("DispensaireGrade").delete().eq("id", id);
  return error ? { ok: false, error: "Suppression impossible." } : { ok: true };
}

// Réordonne les grades : `ids[0]` = grade le plus élevé.
export async function reordonnerGrades(ids: string[]): Promise<AdminResult> {
  if (!(await autorise())) return { ok: false, error: "Réservé à l'administration du dispensaire." };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  if (!Array.isArray(ids) || !ids.length) return { ok: true };
  const now = new Date().toISOString();
  const par = await qui();
  const n = ids.length;
  const results = await Promise.all(ids.map((id, i) => admin.from("DispensaireGrade").update({ ordre: n - i, updatedBy: par, updatedAt: now }).eq("id", String(id))));
  return results.some((r) => r.error) ? { ok: false, error: "Réordonnancement partiel — recharge la page." } : { ok: true };
}
