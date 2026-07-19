"use server";

import { envoyerCommande, type CommandeResult } from "@/lib/commandes";

type AvisInput = {
  cible: string; prime?: string; dangerosite?: string; statut?: string;
  position?: string; vivantMort?: string; commanditaire?: string; signalement?: string; photo?: string;
};

export async function emettreAvis(data: AvisInput): Promise<CommandeResult> {
  if (!data.cible || data.cible.trim().length < 2) return { ok: false, error: "Indique la cible de l'avis." };
  return envoyerCommande("traque.create", { ...data });
}
export async function majAvis(id: string, patch: Partial<AvisInput>): Promise<CommandeResult> {
  if (!id) return { ok: false, error: "Avis introuvable." };
  return envoyerCommande("traque.update", { id, ...patch });
}
export async function retirerAvis(id: string): Promise<CommandeResult> {
  if (!id) return { ok: false, error: "Avis introuvable." };
  return envoyerCommande("traque.delete", { id });
}
