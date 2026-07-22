"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionProfile } from "@/lib/queries";
import { getRoleDispensaire } from "@/lib/dispensaire-roles";
import { CONFIG_DEFAUT } from "@/lib/dispensaire-roles-const";

// Panneau d'administration — réservé aux rôles disposant de la permission `admin`.
export type AdminResult = { ok: boolean; error?: string; id?: string };

const ROLES = ["directeur", "adjoint", "rh", "medecin", "infirmier", "stagiaire"];
const s = (v: unknown, max = 200) => { const t = String(v ?? "").trim(); return t ? t.slice(0, max) : null; };
function newId() { return `dme-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`; }
async function autorise() { try { return (await getRoleDispensaire()).perms.admin; } catch { return false; } }
async function qui() { try { return (await getSessionProfile())?.nom || "Équipe"; } catch { return "Équipe"; } }

export async function creerMembre(data: Record<string, unknown>): Promise<AdminResult> {
  if (!(await autorise())) return { ok: false, error: "Réservé à l'administration du dispensaire." };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  const nom = s(data.nom);
  if (!nom) return { ok: false, error: "Donne le nom du membre." };
  const role = ROLES.includes(String(data.role)) ? String(data.role) : "stagiaire";
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
  if ("role" in patch) row.role = ROLES.includes(String(patch.role)) ? patch.role : "stagiaire";
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
