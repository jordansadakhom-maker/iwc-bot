"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionProfile } from "@/lib/queries";
import { peutModifierStock } from "@/lib/dispensaire-roles";

// Matières premières — réservé aux grades disposant du droit « stock ».
export type MatiereResult = { ok: boolean; error?: string; id?: string };
const REFUS = "Accès refusé : ton grade ne permet pas de modifier les matières.";

type Champ = "nom" | "unite" | "fournisseur" | "note";
const CHAMPS: Champ[] = ["nom", "unite", "fournisseur", "note"];
const NUMS = ["quantite", "seuil", "cible"] as const;

const s = (v: unknown, max = 200) => { const t = String(v ?? "").trim(); return t ? t.slice(0, max) : null; };
const n = (v: unknown) => Math.max(0, Math.round(Number(v) || 0));
function newId() { return `dm-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`; }
async function qui() { try { return (await getSessionProfile())?.nom || "Équipe"; } catch { return "Équipe"; } }

function nettoyer(data: Record<string, unknown>) {
  const row: Record<string, unknown> = {};
  for (const c of CHAMPS) if (c in data) row[c] = s(data[c], c === "note" ? 1000 : 200);
  for (const k of NUMS) if (k in data) row[k] = n(data[k]);
  return row;
}

export async function creerMatiere(data: Record<string, unknown>): Promise<MatiereResult> {
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  if (!(await peutModifierStock())) return { ok: false, error: REFUS };
  const row = nettoyer(data);
  if (!row.nom) return { ok: false, error: "Donne le nom de la matière." };
  const id = newId();
  const now = new Date().toISOString();
  const { error } = await admin.from("DispensaireMatiere").insert({ id, quantite: 0, seuil: 0, cible: 0, ...row, updatedBy: await qui(), updatedAt: now });
  return error ? { ok: false, error: "Création impossible (la table existe-t-elle ?)." } : { ok: true, id };
}

export async function majMatiere(id: string, patch: Record<string, unknown>): Promise<MatiereResult> {
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  if (!(await peutModifierStock())) return { ok: false, error: REFUS };
  if (!id) return { ok: false, error: "Matière introuvable." };
  const row = nettoyer(patch);
  if ("nom" in row && !row.nom) return { ok: false, error: "Le nom ne peut pas être vide." };
  if (!Object.keys(row).length) return { ok: true };
  const { error } = await admin.from("DispensaireMatiere").update({ ...row, updatedBy: await qui(), updatedAt: new Date().toISOString() }).eq("id", id);
  return error ? { ok: false, error: "Enregistrement impossible." } : { ok: true };
}

export async function ajusterMatiere(id: string, delta: number): Promise<MatiereResult> {
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  if (!(await peutModifierStock())) return { ok: false, error: REFUS };
  const d = Math.round(Number(delta) || 0);
  if (!d) return { ok: false, error: "Indique une quantité." };
  const { data: ex } = await admin.from("DispensaireMatiere").select("id,quantite").eq("id", id).maybeSingle();
  if (!ex) return { ok: false, error: "Matière introuvable." };
  const apres = Math.max(0, (Number((ex as Record<string, unknown>).quantite) || 0) + d);
  const { error } = await admin.from("DispensaireMatiere").update({ quantite: apres, updatedBy: await qui(), updatedAt: new Date().toISOString() }).eq("id", id);
  return error ? { ok: false, error: "Enregistrement impossible." } : { ok: true };
}

export async function supprimerMatiere(id: string): Promise<MatiereResult> {
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  if (!(await peutModifierStock())) return { ok: false, error: REFUS };
  const { error } = await admin.from("DispensaireMatiere").delete().eq("id", id);
  return error ? { ok: false, error: "Suppression impossible." } : { ok: true };
}
