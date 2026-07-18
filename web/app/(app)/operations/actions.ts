"use server";

import { envoyerCommande, type CommandeResult } from "@/lib/commandes";

// Actions sur les opérations → file de commandes, appliquées par le bot puis
// resynchronisées sur le site.

export async function creerOperation(data: {
  cible: string; categorie?: string; pole?: string; prime?: string; lieu?: string; objectif?: string; phase?: string;
}): Promise<CommandeResult> {
  if (!data.cible || data.cible.trim().length < 2) return { ok: false, error: "Donne un titre à l'opération." };
  return envoyerCommande("operation.create", { ...data });
}

export async function majOperation(
  id: string,
  patch: { cible?: string; categorie?: string; prime?: string; lieu?: string; objectif?: string; phase?: string }
): Promise<CommandeResult> {
  if (!id) return { ok: false, error: "Opération introuvable." };
  return envoyerCommande("operation.update", { id, ...patch });
}

export async function changerPhase(id: string, phase: string): Promise<CommandeResult> {
  if (!id) return { ok: false, error: "Opération introuvable." };
  return envoyerCommande("operation.update", { id, phase });
}

export async function supprimerOperation(id: string): Promise<CommandeResult> {
  if (!id) return { ok: false, error: "Opération introuvable." };
  return envoyerCommande("operation.delete", { id });
}

// ── Contrats ──
export async function creerContrat(data: {
  cible: string; commanditaire?: string; remuneration?: string; statut?: string; pole?: string;
}): Promise<CommandeResult> {
  if (!data.cible || data.cible.trim().length < 2) return { ok: false, error: "Donne un objet au contrat." };
  return envoyerCommande("contrat.create", { ...data });
}

export async function majContrat(
  id: string,
  patch: { cible?: string; commanditaire?: string; remuneration?: string; statut?: string; pole?: string }
): Promise<CommandeResult> {
  if (!id) return { ok: false, error: "Contrat introuvable." };
  return envoyerCommande("contrat.update", { id, ...patch });
}

export async function supprimerContrat(id: string): Promise<CommandeResult> {
  if (!id) return { ok: false, error: "Contrat introuvable." };
  return envoyerCommande("contrat.delete", { id });
}
