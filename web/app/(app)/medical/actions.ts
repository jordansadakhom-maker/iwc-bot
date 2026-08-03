"use server";

import { envoyerCommande, type CommandeResult } from "@/lib/commandes";
import { supprimerFiable } from "@/lib/suppression";
import { requireMedical } from "@/lib/authz";
import { validerPieceJointe } from "@/lib/piece-jointe";

// Rempart serveur pour la « référence visuelle » (image blessure/radio/document
// RP) : n'accepte qu'un lien https vers une image, jamais de contenu exécutable.
// Renvoie l'URL normalisée à joindre à la commande (ou une erreur si le lien est
// refusé). Vide = pas de pièce jointe (accepté).
function pieceOuErreur(brut?: string): { url?: string; error?: string } {
  const pj = validerPieceJointe(String(brut ?? ""));
  if (!pj.ok) return { error: pj.error };
  return { url: pj.url || undefined };
}

// Actions médicales → déposées dans la file de commandes, appliquées par le bot
// (dossier Discord + base) puis resynchronisées sur le site.
//
// SÉCURITÉ (fail-closed) : les dossiers médicaux sont réservés au médecin de la
// compagnie et à la Direction (même règle que la page /medical). On applique cette
// politique ici, sur les ÉCRITURES, pour qu'elle ne dépende pas de l'affichage.
const REFUS: CommandeResult = { ok: false, error: "Accès refusé — réservé au médecin et à la Direction." };

export async function creerDossier(membreId: string, statut: string): Promise<CommandeResult> {
  if (!(await requireMedical())) return REFUS;
  if (!membreId) return { ok: false, error: "Aucun membre sélectionné." };
  return envoyerCommande("medical.create", { membreId, statut: statut || "non_teste" });
}

export async function majDossier(
  membreId: string,
  patch: { statut?: string; notes?: string; prochainRdv?: string; testValide?: boolean; reposJusquAt?: string | null; reposMotif?: string }
): Promise<CommandeResult> {
  if (!(await requireMedical())) return REFUS;
  if (!membreId) return { ok: false, error: "Dossier introuvable." };
  return envoyerCommande("medical.update", { membreId, ...patch });
}

export async function ajouterSuivi(
  membreId: string,
  s: { soin: string; soignant?: string; etat?: string; traitement?: string; pieceJointe?: string }
): Promise<CommandeResult> {
  if (!(await requireMedical())) return REFUS;
  if (!membreId) return { ok: false, error: "Dossier introuvable." };
  if (!s.soin || s.soin.trim().length < 2) return { ok: false, error: "Décris le soin prodigué." };
  const pj = pieceOuErreur(s.pieceJointe);
  if (pj.error) return { ok: false, error: pj.error };
  return envoyerCommande("medical.addSuivi", { membreId, ...s, pieceJointe: pj.url });
}

export async function ajouterBlessure(
  membreId: string,
  b: { desc: string; localisation?: string; gravite?: string; statut?: string; pieceJointe?: string }
): Promise<CommandeResult> {
  if (!(await requireMedical())) return REFUS;
  if (!membreId) return { ok: false, error: "Dossier introuvable." };
  if (!b.desc || b.desc.trim().length < 2) return { ok: false, error: "Décris la blessure." };
  const pj = pieceOuErreur(b.pieceJointe);
  if (pj.error) return { ok: false, error: pj.error };
  return envoyerCommande("medical.addBlessure", { membreId, ...b, pieceJointe: pj.url });
}

export async function ajouterOrdonnance(
  membreId: string,
  o: { medicaments: string; posologie?: string; duree?: string; conseils?: string; pieceJointe?: string }
): Promise<CommandeResult> {
  if (!(await requireMedical())) return REFUS;
  if (!membreId) return { ok: false, error: "Dossier introuvable." };
  if (!o.medicaments || o.medicaments.trim().length < 2) return { ok: false, error: "Indique le médicament." };
  const pj = pieceOuErreur(o.pieceJointe);
  if (pj.error) return { ok: false, error: pj.error };
  return envoyerCommande("medical.addOrdonnance", { membreId, ...o, pieceJointe: pj.url });
}

export async function supprimerDossier(membreId: string): Promise<CommandeResult> {
  if (!(await requireMedical())) return REFUS;
  // Le dossier médical est référencé par `membreId` (et non `id`).
  return supprimerFiable({ type: "medical.delete", payload: { membreId }, table: "DossierMedical", colonne: "membreId", valeur: membreId, okMsg: "Dossier supprimé." });
}
