"use server";

import { envoyerCommande, type CommandeResult } from "@/lib/commandes";
import { supprimerFiable } from "@/lib/suppression";

// Actions médicales → déposées dans la file de commandes, appliquées par le bot
// (dossier Discord + base) puis resynchronisées sur le site.

export async function creerDossier(membreId: string, statut: string): Promise<CommandeResult> {
  if (!membreId) return { ok: false, error: "Aucun membre sélectionné." };
  return envoyerCommande("medical.create", { membreId, statut: statut || "non_teste" });
}

export async function majDossier(
  membreId: string,
  patch: { statut?: string; notes?: string; prochainRdv?: string; testValide?: boolean; reposJusquAt?: string | null; reposMotif?: string }
): Promise<CommandeResult> {
  if (!membreId) return { ok: false, error: "Dossier introuvable." };
  return envoyerCommande("medical.update", { membreId, ...patch });
}

export async function ajouterSuivi(
  membreId: string,
  s: { soin: string; soignant?: string; etat?: string; traitement?: string }
): Promise<CommandeResult> {
  if (!membreId) return { ok: false, error: "Dossier introuvable." };
  if (!s.soin || s.soin.trim().length < 2) return { ok: false, error: "Décris le soin prodigué." };
  return envoyerCommande("medical.addSuivi", { membreId, ...s });
}

export async function ajouterBlessure(
  membreId: string,
  b: { desc: string; localisation?: string; gravite?: string; statut?: string }
): Promise<CommandeResult> {
  if (!membreId) return { ok: false, error: "Dossier introuvable." };
  if (!b.desc || b.desc.trim().length < 2) return { ok: false, error: "Décris la blessure." };
  return envoyerCommande("medical.addBlessure", { membreId, ...b });
}

export async function ajouterOrdonnance(
  membreId: string,
  o: { medicaments: string; posologie?: string; duree?: string; conseils?: string }
): Promise<CommandeResult> {
  if (!membreId) return { ok: false, error: "Dossier introuvable." };
  if (!o.medicaments || o.medicaments.trim().length < 2) return { ok: false, error: "Indique le médicament." };
  return envoyerCommande("medical.addOrdonnance", { membreId, ...o });
}

export async function supprimerDossier(membreId: string): Promise<CommandeResult> {
  // Le dossier médical est référencé par `membreId` (et non `id`).
  return supprimerFiable({ type: "medical.delete", payload: { membreId }, table: "DossierMedical", colonne: "membreId", valeur: membreId, okMsg: "Dossier supprimé." });
}
