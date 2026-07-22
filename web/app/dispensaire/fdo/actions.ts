"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionProfile } from "@/lib/queries";

// Soins FDO — soins prodigués aux forces de l'ordre (par bureau).
export type FdoResult = { ok: boolean; error?: string; id?: string };

const STATUTS = ["offert", "facture", "regle"];
type Champ = "bureau" | "agent" | "soin" | "note";
const CHAMPS: Champ[] = ["bureau", "agent", "soin", "note"];

const s = (v: unknown, max = 300) => { const t = String(v ?? "").trim(); return t ? t.slice(0, max) : null; };
const n = (v: unknown) => Math.max(0, Math.round(Number(v) || 0));
function newId() { return `dfo-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`; }
async function qui() { try { return (await getSessionProfile())?.nom || "Équipe"; } catch { return "Équipe"; } }

function nettoyer(data: Record<string, unknown>) {
  const row: Record<string, unknown> = {};
  for (const c of CHAMPS) if (c in data) row[c] = s(data[c], c === "note" || c === "soin" ? 1000 : 200);
  if ("montant" in data) row.montant = n(data.montant);
  if ("statut" in data) row.statut = STATUTS.includes(String(data.statut)) ? data.statut : "offert";
  return row;
}

export async function creerSoin(data: Record<string, unknown>): Promise<FdoResult> {
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  const row = nettoyer(data);
  if (!row.bureau) return { ok: false, error: "Indique le bureau du shérif." };
  const id = newId();
  const now = new Date().toISOString();
  const { error } = await admin.from("DispensaireSoinFDO").insert({ id, statut: "offert", montant: 0, ...row, par: await qui(), createdAt: now, updatedAt: now });
  return error ? { ok: false, error: "Création impossible (la table existe-t-elle ?)." } : { ok: true, id };
}

export async function majSoin(id: string, patch: Record<string, unknown>): Promise<FdoResult> {
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  if (!id) return { ok: false, error: "Soin introuvable." };
  const row = nettoyer(patch);
  if ("bureau" in row && !row.bureau) return { ok: false, error: "Le bureau ne peut pas être vide." };
  if (!Object.keys(row).length) return { ok: true };
  const { error } = await admin.from("DispensaireSoinFDO").update({ ...row, updatedAt: new Date().toISOString() }).eq("id", id);
  return error ? { ok: false, error: "Enregistrement impossible." } : { ok: true };
}

export async function supprimerSoin(id: string): Promise<FdoResult> {
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  const { error } = await admin.from("DispensaireSoinFDO").delete().eq("id", id);
  return error ? { ok: false, error: "Suppression impossible." } : { ok: true };
}
