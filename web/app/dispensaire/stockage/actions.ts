"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionProfile } from "@/lib/queries";

// Stockage — outil de service partagé. Chaque mouvement est tracé.
export type StockResult = { ok: boolean; error?: string; id?: string; apres?: number };

type Champ = "nom" | "categorie" | "coffre" | "unite" | "note" | "photo";
const CHAMPS: Champ[] = ["nom", "categorie", "coffre", "unite", "note", "photo"];
const CATS = ["medicament", "materiel", "matiere", "nourriture", "autre"];
const NUMS = ["stock", "stockFixe", "seuil"] as const;

const s = (v: unknown, max = 200) => { const t = String(v ?? "").trim(); return t ? t.slice(0, max) : null; };
const n = (v: unknown) => Math.max(0, Math.round(Number(v) || 0));
function newId(p: string) { return `${p}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`; }
async function qui() { try { return (await getSessionProfile())?.nom || "Équipe"; } catch { return "Équipe"; } }

function nettoyer(data: Record<string, unknown>) {
  const row: Record<string, unknown> = {};
  for (const c of CHAMPS) if (c in data) {
    if (c === "categorie") row[c] = CATS.includes(String(data[c])) ? data[c] : "materiel";
    else row[c] = s(data[c], c === "note" ? 1000 : c === "photo" ? 600 : 200);
  }
  for (const k of NUMS) if (k in data) row[k] = n(data[k]);
  return row;
}

export async function creerItem(data: Record<string, unknown>): Promise<StockResult> {
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  const row = nettoyer(data);
  if (!row.nom) return { ok: false, error: "Donne le nom de l'article." };
  const id = newId("dst");
  const now = new Date().toISOString();
  const { error } = await admin.from("DispensaireStock").insert({ id, categorie: "materiel", stock: 0, stockFixe: 0, seuil: 0, ...row, updatedBy: await qui(), updatedAt: now });
  if (error) return { ok: false, error: "Création impossible (la table existe-t-elle ?)." };
  // Trace le stock initial s'il est non nul.
  if (Number(row.stock) > 0) await admin.from("DispensaireStockMouvement").insert({ id: newId("dsm"), stockId: id, nomItem: String(row.nom), coffre: row.coffre ?? null, delta: Number(row.stock), apres: Number(row.stock), motif: "Stock initial", par: await qui(), createdAt: now });
  return { ok: true, id };
}

export async function majItem(id: string, patch: Record<string, unknown>): Promise<StockResult> {
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  if (!id) return { ok: false, error: "Article introuvable." };
  const row = nettoyer(patch);
  if ("nom" in row && !row.nom) return { ok: false, error: "Le nom ne peut pas être vide." };
  if (!Object.keys(row).length) return { ok: true };
  const { error } = await admin.from("DispensaireStock").update({ ...row, updatedBy: await qui(), updatedAt: new Date().toISOString() }).eq("id", id);
  return error ? { ok: false, error: "Enregistrement impossible." } : { ok: true };
}

export async function supprimerItem(id: string): Promise<StockResult> {
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  const { error } = await admin.from("DispensaireStock").delete().eq("id", id);
  return error ? { ok: false, error: "Suppression impossible." } : { ok: true };
}

// Applique un mouvement ± sur le stock glissant et le trace.
export async function ajusterStock(id: string, delta: number, motif?: string): Promise<StockResult> {
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  const d = Math.round(Number(delta) || 0);
  if (!d) return { ok: false, error: "Indique une quantité." };
  const { data: ex } = await admin.from("DispensaireStock").select("id,nom,stock,coffre").eq("id", id).maybeSingle();
  if (!ex) return { ok: false, error: "Article introuvable." };
  const r = ex as Record<string, unknown>;
  const apres = Math.max(0, (Number(r.stock) || 0) + d);
  const now = new Date().toISOString();
  const par = await qui();
  const { error } = await admin.from("DispensaireStock").update({ stock: apres, updatedBy: par, updatedAt: now }).eq("id", id);
  if (error) return { ok: false, error: "Enregistrement impossible." };
  await admin.from("DispensaireStockMouvement").insert({ id: newId("dsm"), stockId: id, nomItem: String(r.nom || "?"), coffre: (r.coffre as string) ?? null, delta: d, apres, motif: s(motif, 200), par, createdAt: now });
  return { ok: true, apres };
}
