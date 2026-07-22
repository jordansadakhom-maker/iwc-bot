"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionProfile } from "@/lib/queries";

// Rapports médicaux (liens Canva) — ouvert au personnel soignant connecté.
export type RapportResult = { ok: boolean; error?: string; id?: string };

type Champ = "titre" | "categorie" | "patient" | "lien" | "auteur" | "note";
const CHAMPS: Champ[] = ["titre", "categorie", "patient", "lien", "auteur", "note"];
const s = (v: unknown, max = 400) => { const t = String(v ?? "").trim(); return t ? t.slice(0, max) : null; };
function newId() { return `dr-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`; }
async function qui() { try { return (await getSessionProfile())?.nom || "Équipe"; } catch { return "Équipe"; } }

function nettoyer(data: Record<string, unknown>) {
  const row: Record<string, unknown> = {};
  for (const c of CHAMPS) if (c in data) row[c] = s(data[c], c === "note" ? 2000 : c === "lien" ? 1000 : 300);
  return row;
}

export async function creerRapport(data: Record<string, unknown>): Promise<RapportResult> {
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  const row = nettoyer(data);
  if (!row.titre) return { ok: false, error: "Donne un nom au rapport." };
  const id = newId();
  const { error } = await admin.from("DispensaireRapport").insert({ id, auteur: row.auteur ?? (await qui()), ...row, par: await qui(), createdAt: new Date().toISOString() });
  return error ? { ok: false, error: "Enregistrement impossible (la table existe-t-elle ?)." } : { ok: true, id };
}

export async function majRapport(id: string, patch: Record<string, unknown>): Promise<RapportResult> {
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  if (!id) return { ok: false, error: "Rapport introuvable." };
  const row = nettoyer(patch);
  if ("titre" in row && !row.titre) return { ok: false, error: "Le nom ne peut pas être vide." };
  if (!Object.keys(row).length) return { ok: true };
  const { error } = await admin.from("DispensaireRapport").update(row).eq("id", id);
  return error ? { ok: false, error: "Enregistrement impossible." } : { ok: true };
}

export async function supprimerRapport(id: string): Promise<RapportResult> {
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  const { error } = await admin.from("DispensaireRapport").delete().eq("id", id);
  return error ? { ok: false, error: "Suppression impossible." } : { ok: true };
}
