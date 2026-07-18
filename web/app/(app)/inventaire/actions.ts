"use server";

import { envoyerCommande, type CommandeResult } from "@/lib/commandes";

export async function creerArme(data: { serie: string; type?: string; categorie?: string; appartenance?: string; membreNom?: string; notes?: string }): Promise<CommandeResult> {
  if (!data.serie || data.serie.trim().length < 1) return { ok: false, error: "Indique un n° de série." };
  return envoyerCommande("arme.create", { ...data });
}
export async function majArme(id: string, patch: { serie?: string; type?: string; categorie?: string; appartenance?: string; membreNom?: string; notes?: string }): Promise<CommandeResult> {
  if (!id) return { ok: false, error: "Arme introuvable." };
  return envoyerCommande("arme.update", { id, ...patch });
}
export async function supprimerArme(id: string): Promise<CommandeResult> {
  if (!id) return { ok: false, error: "Arme introuvable." };
  return envoyerCommande("arme.delete", { id });
}
