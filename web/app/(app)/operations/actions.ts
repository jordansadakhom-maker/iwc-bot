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

// Assigner des agents à une opération (les prévient en MP via le bot).
export async function assignerOperation(id: string, membreIds: string[], membresNoms: string[]): Promise<CommandeResult> {
  if (!id) return { ok: false, error: "Opération introuvable." };
  const ids = (Array.isArray(membreIds) ? membreIds : []).map(String).filter(Boolean).slice(0, 20);
  if (!ids.length) return { ok: false, error: "Choisis au moins une personne." };
  return envoyerCommande("operation.assigner", { id, membreIds: ids, membresNoms: membresNoms.slice(0, 20) });
}

// Terminer une opération (résultat + versement éventuel de la prime au coffre).
export async function terminerOperation(
  id: string,
  data: { resultat?: string; butin?: string; pertes?: string; debrief?: string; montantPrime?: number }
): Promise<CommandeResult> {
  if (!id) return { ok: false, error: "Opération introuvable." };
  return envoyerCommande("operation.terminer", { id, ...data, montantPrime: Math.max(0, Math.round(Number(data.montantPrime) || 0)) });
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

// Suivi / pipeline (En attente → En cours → Validé → Honoré → Abandonné).
export async function majSuiviContrat(id: string, suivi: string): Promise<CommandeResult> {
  if (!id) return { ok: false, error: "Contrat introuvable." };
  return envoyerCommande("contrat.suivi", { id, suivi });
}

// Honorer : crédite le coffre + crée une facture (via le bot).
export async function honorerContrat(id: string, montant: number): Promise<CommandeResult> {
  if (!id) return { ok: false, error: "Contrat introuvable." };
  const m = Math.round(Number(montant) || 0);
  if (m <= 0) return { ok: false, error: "Indique un montant à verser au coffre." };
  return envoyerCommande("contrat.honorer", { id, montant: m });
}

// Envoyer une FEUILLE DE CONTRAT d'opération au commanditaire en MP Discord
// (le bot le DM ; le commanditaire répond « JE SIGNE »). Réutilise la file de
// commandes, comme l'envoi de contrat d'armurerie.
export async function envoyerContratOperation(data: {
  operationId?: string; commanditaire: string; clientDiscordId: string;
  categorie?: string; objectif?: string; lieu?: string; pole?: string;
  remuneration?: string; agentsNoms?: string; conditions?: string; sens?: string;
}): Promise<CommandeResult> {
  const did = String(data.clientDiscordId || "").trim();
  if (!did) return { ok: false, error: "Renseigne l'ID Discord du commanditaire pour l'envoi." };
  if (!data.commanditaire || data.commanditaire.trim().length < 2) return { ok: false, error: "Indique le nom du commanditaire." };
  return envoyerCommande("operation.contrat", { ...data, clientDiscordId: did });
}
