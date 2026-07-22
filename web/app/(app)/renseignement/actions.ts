"use server";

import { envoyerCommande, type CommandeResult } from "@/lib/commandes";
import { supprimerFiable } from "@/lib/suppression";

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
  return supprimerFiable({ type: "rapport.delete", payload: { id }, table: "RapportInfo", colonne: "id", valeur: id, okMsg: "Rapport supprimé." });
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
  return supprimerFiable({ type: "traque.delete", payload: { id }, table: "Traque", colonne: "id", valeur: id, okMsg: "Traque supprimée." });
}
