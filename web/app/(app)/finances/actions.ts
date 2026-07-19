"use server";

import { envoyerCommande, type CommandeResult } from "@/lib/commandes";

// Ajuste un coffre (dépôt / retrait / montant exact). Appliqué par le bot.
export async function ajusterCoffre(
  cible: "commun" | "legal" | "illegal",
  montant: number,
  mode: "depot" | "retrait" | "set"
): Promise<CommandeResult> {
  if (!["commun", "legal", "illegal"].includes(cible)) return { ok: false, error: "Coffre inconnu." };
  if (!Number.isFinite(montant) || montant < 0) return { ok: false, error: "Montant invalide." };
  return envoyerCommande("coffre.ajuster", { cible, montant: Math.round(montant), mode });
}

// ── Factures ──
export async function creerFacture(data: { objet: string; montant: number; clientNom?: string; type?: string; remuneration?: string }): Promise<CommandeResult> {
  if (!data.objet || data.objet.trim().length < 2) return { ok: false, error: "Indique l'objet de la facture." };
  if (!Number.isFinite(data.montant) || data.montant < 0) return { ok: false, error: "Montant invalide." };
  return envoyerCommande("facture.create", { ...data, montant: Math.round(data.montant) });
}
export async function supprimerFacture(id: string): Promise<CommandeResult> {
  if (!id) return { ok: false, error: "Facture introuvable." };
  return envoyerCommande("facture.delete", { id });
}
