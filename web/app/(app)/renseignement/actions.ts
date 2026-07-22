"use server";

import { envoyerCommande, type CommandeResult } from "@/lib/commandes";
import { createAdminClient } from "@/lib/supabase/admin";

// Suppression fiable : on ATTEND le verdict du bot (il retire l'élément de SES
// données, sinon la réconciliation le ré-ajouterait) ET on retire la ligne
// directement en base → disparition immédiate du site, même si le bot est
// momentanément désynchronisé (données éphémères sur Render).
async function supprimerFiable(type: string, table: string, id: string, okMsg: string): Promise<CommandeResult> {
  const cid = String(id || "").trim();
  if (!cid) return { ok: false, error: "Élément introuvable." };
  const r = await envoyerCommande(type, { id: cid }, { attendre: true, timeoutMs: 12000 });
  try { const admin = createAdminClient(); if (admin) await admin.from(table).delete().eq("id", cid); } catch { /* best-effort */ }
  return { ok: true, message: r.ok ? (r.message || okMsg) : okMsg };
}

// ── Rapports d'informateurs ──
export async function creerRapport(data: { info: string; source?: string; cible?: string; fiabilite?: number; statut?: string }): Promise<CommandeResult> {
  if (!data.info || data.info.trim().length < 2) return { ok: false, error: "Écris le renseignement." };
  return envoyerCommande("rapport.create", { ...data });
}
export async function majRapport(id: string, patch: { info?: string; source?: string; cible?: string; fiabilite?: number; statut?: string }): Promise<CommandeResult> {
  if (!id) return { ok: false, error: "Rapport introuvable." };
  return envoyerCommande("rapport.update", { id, ...patch });
}
export async function supprimerRapport(id: string): Promise<CommandeResult> {
  return supprimerFiable("rapport.delete", "RapportInfo", id, "Rapport supprimé.");
}

// ── Personnes traquées ──
export async function creerTraque(data: { cible: string; prime?: string; dangerosite?: string; statut?: string }): Promise<CommandeResult> {
  if (!data.cible || data.cible.trim().length < 2) return { ok: false, error: "Indique la cible." };
  return envoyerCommande("traque.create", { ...data });
}
export async function majTraque(id: string, patch: { cible?: string; prime?: string; dangerosite?: string; statut?: string }): Promise<CommandeResult> {
  if (!id) return { ok: false, error: "Traque introuvable." };
  return envoyerCommande("traque.update", { id, ...patch });
}
export async function supprimerTraque(id: string): Promise<CommandeResult> {
  return supprimerFiable("traque.delete", "Traque", id, "Traque supprimée.");
}
