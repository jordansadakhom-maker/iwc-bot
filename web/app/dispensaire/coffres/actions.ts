"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionProfile } from "@/lib/queries";
import { peutModifierStock } from "@/lib/dispensaire-roles";

// Coffres (entités) — réservé aux grades disposant du droit « stock ».
export type CoffreResult = { ok: boolean; error?: string; id?: string };
const REFUS = "Accès refusé : ton grade ne permet pas de modifier les coffres.";

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
  if (!(await peutModifierStock())) return { ok: false, error: REFUS };
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
  if (!(await peutModifierStock())) return { ok: false, error: REFUS };
  if (!id) return { ok: false, error: "Coffre introuvable." };
  const row = nettoyer(patch);
  if ("nom" in row && !row.nom) return { ok: false, error: "Le nom ne peut pas être vide." };
  if (!Object.keys(row).length) return { ok: true };
  // Les objets référencent le coffre par son nom : si le nom change, on répercute
  // la nouvelle valeur sur tous les articles rangés dans ce coffre.
  let ancienNom: string | null = null;
  if ("nom" in row) { const { data: ex } = await admin.from("DispensaireCoffre").select("nom").eq("id", id).maybeSingle(); ancienNom = ex ? String((ex as Record<string, unknown>).nom || "") : null; }
  const { error } = await admin.from("DispensaireCoffre").update({ ...row, updatedBy: await qui(), updatedAt: new Date().toISOString() }).eq("id", id);
  if (error) return { ok: false, error: "Enregistrement impossible." };
  if (ancienNom && ancienNom !== row.nom) await admin.from("DispensaireStock").update({ coffre: row.nom }).eq("coffre", ancienNom);
  return { ok: true };
}

export async function supprimerCoffre(id: string): Promise<CoffreResult> {
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  if (!(await peutModifierStock())) return { ok: false, error: REFUS };
  // Les objets rangés ne sont pas supprimés : ils repassent en « Non rangé »
  // (coffre détaché) pour ne pas laisser de coffre fantôme.
  const { data: ex } = await admin.from("DispensaireCoffre").select("nom").eq("id", id).maybeSingle();
  const nom = ex ? String((ex as Record<string, unknown>).nom || "").trim() : "";
  if (nom) await admin.from("DispensaireStock").update({ coffre: null }).eq("coffre", nom);
  const { error } = await admin.from("DispensaireCoffre").delete().eq("id", id);
  return error ? { ok: false, error: "Suppression impossible." } : { ok: true };
}
