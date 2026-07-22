"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getAcces, getSessionProfile } from "@/lib/queries";

// Notes de frais — dépôt ouvert à tous ; validation/virement réservés aux chefs.
export type FraisResult = { ok: boolean; error?: string; id?: string };

const STATUTS = ["en_attente", "valide", "refuse", "vire"];
const s = (v: unknown, max = 300) => { const t = String(v ?? "").trim(); return t ? t.slice(0, max) : null; };
const n = (v: unknown) => Math.max(0, Math.round(Number(v) || 0));
function newId() { return `dfr-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`; }
async function peutValider() { try { return (await getAcces()).peutMedical; } catch { return true; } }
async function qui() { try { return (await getSessionProfile())?.nom || "Équipe"; } catch { return "Équipe"; } }

export async function creerFrais(data: Record<string, unknown>): Promise<FraisResult> {
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  const objet = s(data.objet);
  if (!objet) return { ok: false, error: "Donne l'objet de la note de frais." };
  const id = newId();
  const now = new Date().toISOString();
  const par = await qui();
  const { error } = await admin.from("DispensaireFrais").insert({ id, objet, montant: n(data.montant), demandeur: s(data.demandeur) || par, statut: "en_attente", note: s(data.note, 1000), par, createdAt: now, updatedAt: now });
  return error ? { ok: false, error: "Création impossible (la table existe-t-elle ?)." } : { ok: true, id };
}

// Change le statut (valider / refuser / marquer virée). Réservé aux chefs.
export async function statutFrais(id: string, statut: string): Promise<FraisResult> {
  if (!(await peutValider())) return { ok: false, error: "Validation réservée aux chefs." };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  if (!STATUTS.includes(statut)) return { ok: false, error: "Statut inconnu." };
  const patch: Record<string, unknown> = { statut, updatedAt: new Date().toISOString() };
  if (statut === "valide" || statut === "vire") patch.validePar = await qui();
  const { error } = await admin.from("DispensaireFrais").update(patch).eq("id", id);
  return error ? { ok: false, error: "Enregistrement impossible." } : { ok: true };
}

export async function supprimerFrais(id: string): Promise<FraisResult> {
  if (!(await peutValider())) return { ok: false, error: "Suppression réservée aux chefs." };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  const { error } = await admin.from("DispensaireFrais").delete().eq("id", id);
  return error ? { ok: false, error: "Suppression impossible." } : { ok: true };
}
