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
