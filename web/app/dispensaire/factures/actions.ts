"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getAcces, getSessionProfile } from "@/lib/queries";

// Factures — RÉSERVÉ aux chefs (habilités). Suivi des impayés.
export type FactureResult = { ok: boolean; error?: string; id?: string };

const STATUTS = ["non_payee", "payee", "dossier_police", "cloture"];
type Champ = "objet" | "destinataire" | "note";
const CHAMPS: Champ[] = ["objet", "destinataire", "note"];

const s = (v: unknown, max = 300) => { const t = String(v ?? "").trim(); return t ? t.slice(0, max) : null; };
const n = (v: unknown) => Math.max(0, Math.round(Number(v) || 0));
const dt = (v: unknown) => { const t = String(v ?? "").trim(); return /^\d{4}-\d{2}-\d{2}/.test(t) ? t.slice(0, 10) : null; };
function newId() { return `df-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`; }
async function autorise() { try { return (await getAcces()).peutMedical; } catch { return true; } }
async function qui() { try { return (await getSessionProfile())?.nom || "Équipe"; } catch { return "Équipe"; } }

function nettoyer(data: Record<string, unknown>) {
  const row: Record<string, unknown> = {};
  for (const c of CHAMPS) if (c in data) row[c] = s(data[c], c === "note" ? 1000 : 300);
  if ("montant" in data) row.montant = n(data.montant);
  if ("dateEmission" in data) row.dateEmission = dt(data.dateEmission);
  if ("dateEcheance" in data) row.dateEcheance = dt(data.dateEcheance);
  if ("statut" in data) row.statut = STATUTS.includes(String(data.statut)) ? data.statut : "non_payee";
  return row;
}

export async function creerFacture(data: Record<string, unknown>): Promise<FactureResult> {
  if (!(await autorise())) return { ok: false, error: "Réservé aux chefs." };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  const row = nettoyer(data);
  if (!row.objet) return { ok: false, error: "Donne l'objet de la facture." };
  const id = newId();
  const now = new Date().toISOString();
  const { error } = await admin.from("DispensaireFacture").insert({ id, statut: "non_payee", montant: 0, ...row, par: await qui(), createdAt: now, updatedAt: now });
  return error ? { ok: false, error: "Création impossible (la table existe-t-elle ?)." } : { ok: true, id };
}

export async function majFacture(id: string, patch: Record<string, unknown>): Promise<FactureResult> {
  if (!(await autorise())) return { ok: false, error: "Réservé aux chefs." };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  if (!id) return { ok: false, error: "Facture introuvable." };
  const row = nettoyer(patch);
  if ("objet" in row && !row.objet) return { ok: false, error: "L'objet ne peut pas être vide." };
  if (!Object.keys(row).length) return { ok: true };
  const { error } = await admin.from("DispensaireFacture").update({ ...row, updatedAt: new Date().toISOString() }).eq("id", id);
  return error ? { ok: false, error: "Enregistrement impossible." } : { ok: true };
}

export async function supprimerFacture(id: string): Promise<FactureResult> {
  if (!(await autorise())) return { ok: false, error: "Réservé aux chefs." };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  const { error } = await admin.from("DispensaireFacture").delete().eq("id", id);
  return error ? { ok: false, error: "Suppression impossible." } : { ok: true };
}
