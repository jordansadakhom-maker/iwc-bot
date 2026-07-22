"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionProfile } from "@/lib/queries";

// Coffres (entités) — outil de service partagé.
export type CoffreResult = { ok: boolean; error?: string; id?: string };

type Champ = "nom" | "emplacement" | "responsable" | "note" | "photo";
const CHAMPS: Champ[] = ["nom", "emplacement", "responsable", "note", "photo"];
const s = (v: unknown, max = 200) => { const t = String(v ?? "").trim(); return t ? t.slice(0, max) : null; };
function newId() { return `dcf-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`; }
async function qui() { try { return (await getSessionProfile())?.nom || "Équipe"; } catch { return "Équipe"; } }

function nettoyer(data: Record<string, unknown>) {
  const row: Record<string, unknown> = {};
  for (const c of CHAMPS) if (c in data) row[c] = s(data[c], c === "note" ? 1000 : c === "photo" ? 600 : 200);
  return row;
}

export async function creerCoffre(data: Record<string, unknown>): Promise<CoffreResult> {
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  const row = nettoyer(data);
  if (!row.nom) return { ok: false, error: "Donne le nom du coffre." };
  const id = newId();
  const now = new Date().toISOString();
  const { error } = await admin.from("DispensaireCoffre").insert({ id, ...row, updatedBy: await qui(), updatedAt: now });
  return error ? { ok: false, error: "Création impossible (la table existe-t-elle ?)." } : { ok: true, id };
}

export async function majCoffre(id: string, patch: Record<string, unknown>): Promise<CoffreResult> {
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  if (!id) return { ok: false, error: "Coffre introuvable." };
  const row = nettoyer(patch);
  if ("nom" in row && !row.nom) return { ok: false, error: "Le nom ne peut pas être vide." };
  if (!Object.keys(row).length) return { ok: true };
  const { error } = await admin.from("DispensaireCoffre").update({ ...row, updatedBy: await qui(), updatedAt: new Date().toISOString() }).eq("id", id);
  return error ? { ok: false, error: "Enregistrement impossible." } : { ok: true };
}

export async function supprimerCoffre(id: string): Promise<CoffreResult> {
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  const { error } = await admin.from("DispensaireCoffre").delete().eq("id", id);
  return error ? { ok: false, error: "Suppression impossible." } : { ok: true };
}
