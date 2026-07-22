"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionProfile } from "@/lib/queries";

// Ventes — comptoir du dispensaire (ouvert à toute personne connectée).
export type VenteResult = { ok: boolean; error?: string; id?: string };

const s = (v: unknown, max = 200) => { const t = String(v ?? "").trim(); return t ? t.slice(0, max) : null; };
const n = (v: unknown) => Math.max(0, Math.round(Number(v) || 0));
function newId() { return `dv-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`; }
async function qui() { try { return (await getSessionProfile())?.nom || "Équipe"; } catch { return "Équipe"; } }

export async function creerVente(data: Record<string, unknown>): Promise<VenteResult> {
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  const patient = s(data.patient);
  if (!patient) return { ok: false, error: "Indique le patient." };
  const item = s(data.item) || "Bandage";
  const quantite = Math.max(1, n(data.quantite) || 1);
  const prixUnitaire = n(data.prixUnitaire ?? 4);
  const total = quantite * prixUnitaire;
  const id = newId();
  const { error } = await admin.from("DispensaireVente").insert({ id, patient, item, quantite, prixUnitaire, total, note: s(data.note, 500), par: await qui(), createdAt: new Date().toISOString() });
  return error ? { ok: false, error: "Enregistrement impossible (la table existe-t-elle ?)." } : { ok: true, id };
}

export async function supprimerVente(id: string): Promise<VenteResult> {
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  const { error } = await admin.from("DispensaireVente").delete().eq("id", id);
  return error ? { ok: false, error: "Suppression impossible." } : { ok: true };
}
