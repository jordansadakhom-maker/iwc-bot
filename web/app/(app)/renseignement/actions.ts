"use server";

import { envoyerCommande, type CommandeResult } from "@/lib/commandes";
import { supprimerFiable } from "@/lib/suppression";
import { requireRenseignement } from "@/lib/authz";
import { validerPieceJointe } from "@/lib/piece-jointe";

// Rempart serveur pour la référence visuelle (https + image uniquement).
function pieceOuErreur(brut?: string): { url?: string; error?: string } {
  const pj = validerPieceJointe(String(brut ?? ""));
  if (!pj.ok) return { error: pj.error };
  return { url: pj.url || undefined };
}

// SÉCURITÉ (fail-closed) : le renseignement est réservé à la Direction et aux
// officiers de terrain (même règle que la page /renseignement). Appliquée ici sur
// les ÉCRITURES pour qu'elle ne dépende pas de l'affichage.
const REFUS: CommandeResult = { ok: false, error: "Accès refusé — réservé à la Direction et aux officiers." };

// ── Rapports d'informateurs ──
export async function creerRapport(data: { info: string; source?: string; cible?: string; fiabilite?: number; statut?: string; pieceJointe?: string }): Promise<CommandeResult> {
  if (!(await requireRenseignement())) return REFUS;
  if (!data.info || data.info.trim().length < 2) return { ok: false, error: "Écris le renseignement." };
  const pj = pieceOuErreur(data.pieceJointe);
  if (pj.error) return { ok: false, error: pj.error };
  return envoyerCommande("rapport.create", { ...data, pieceJointe: pj.url });
}
export async function majRapport(id: string, patch: { info?: string; source?: string; cible?: string; fiabilite?: number; statut?: string; pieceJointe?: string }): Promise<CommandeResult> {
  if (!(await requireRenseignement())) return REFUS;
  if (!id) return { ok: false, error: "Rapport introuvable." };
  const pj = pieceOuErreur(patch.pieceJointe);
  if (pj.error) return { ok: false, error: pj.error };
  // Champ présent → URL validée, ou "" pour effacer.
  return envoyerCommande("rapport.update", { id, ...patch, pieceJointe: patch.pieceJointe !== undefined ? (pj.url ?? "") : undefined });
}
export async function supprimerRapport(id: string): Promise<CommandeResult> {
  if (!(await requireRenseignement())) return REFUS;
  return supprimerFiable({ type: "rapport.delete", payload: { id }, table: "RapportInfo", colonne: "id", valeur: id, okMsg: "Rapport supprimé." });
}

// ── Personnes traquées ──
export async function creerTraque(data: { cible: string; prime?: string; dangerosite?: string; statut?: string }): Promise<CommandeResult> {
  if (!(await requireRenseignement())) return REFUS;
  if (!data.cible || data.cible.trim().length < 2) return { ok: false, error: "Indique la cible." };
  return envoyerCommande("traque.create", { ...data });
}
export async function majTraque(id: string, patch: { cible?: string; prime?: string; dangerosite?: string; statut?: string }): Promise<CommandeResult> {
  if (!(await requireRenseignement())) return REFUS;
  if (!id) return { ok: false, error: "Traque introuvable." };
  return envoyerCommande("traque.update", { id, ...patch });
}
export async function supprimerTraque(id: string): Promise<CommandeResult> {
  if (!(await requireRenseignement())) return REFUS;
  return supprimerFiable({ type: "traque.delete", payload: { id }, table: "Traque", colonne: "id", valeur: id, okMsg: "Traque supprimée." });
}
