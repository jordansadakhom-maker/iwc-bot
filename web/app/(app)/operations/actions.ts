"use server";

import { envoyerCommande, type CommandeResult } from "@/lib/commandes";
import { supprimerFiable } from "@/lib/suppression";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActeur, requireOfficier } from "@/lib/authz";
import { suggererAssignation, type CandidatMembre, type Suggestion } from "@/lib/attribution";

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
  return supprimerFiable({ type: "operation.delete", payload: { id }, table: "Operation", colonne: "id", valeur: id, okMsg: "Opération supprimée." });
}

// Attribution assistée : agents recommandés pour une opération. Lecture seule.
// La charge combine les tâches ouvertes ET les opérations actives déjà assignées.
export async function suggererAgents(pole?: string, exclureIds?: string[]): Promise<{ ok: boolean; suggestions: Suggestion[] }> {
  const a = await getActeur();
  if (!a) return { ok: false, suggestions: [] };
  const admin = createAdminClient();
  if (!admin) return { ok: false, suggestions: [] };
  const exclu = new Set((exclureIds || []).map(String));
  const [{ data: mem }, { data: tk }, { data: ops }] = await Promise.all([
    admin.from("Membre").select("id,nomIC,grade,pole,statut"),
    admin.from("Tache").select("assigneId").neq("statut", "faite"),
    admin.from("Operation").select("agentsAssignes,phase"),
  ]);
  const charge = new Map<string, number>();
  for (const t of (tk || []) as { assigneId: string | null }[]) { if (t.assigneId) charge.set(t.assigneId, (charge.get(t.assigneId) || 0) + 1); }
  for (const o of (ops || []) as { agentsAssignes: unknown; phase: string | null }[]) {
    if (/termin|annul|clotur/.test(String(o.phase || "").toLowerCase())) continue; // opérations actives seulement
    const ag = Array.isArray(o.agentsAssignes) ? o.agentsAssignes : [];
    for (const id of ag) { const s = String(id || ""); if (s) charge.set(s, (charge.get(s) || 0) + 1); }
  }
  const candidats: CandidatMembre[] = ((mem || []) as Record<string, unknown>[])
    .filter((m) => String(m.statut || "") !== "parti" && !exclu.has(String(m.id)))
    .map((m) => ({
      id: String(m.id), nom: String(m.nomIC || m.id), grade: (m.grade as string) ?? null,
      pole: String(m.pole || ""), absent: String(m.statut || "") === "absent", charge: charge.get(String(m.id)) || 0,
    }));
  return { ok: true, suggestions: suggererAssignation(candidats, { pole: pole ?? null }, 5) };
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
  // Verse une prime au coffre → réservé à l'encadrement (officier/Direction).
  if (!(await requireOfficier())) return { ok: false, error: "Action réservée aux officiers et à la Direction." };
  // On ATTEND le verdict réel du bot (le versement au coffre a-t-il pris ?).
  return envoyerCommande("operation.terminer", { id, ...data, montantPrime: Math.max(0, Math.round(Number(data.montantPrime) || 0)) }, { attendre: true });
}

// ── Contrats ── (mêmes champs que le formulaire Discord)
export async function creerContrat(data: {
  cible: string; commanditaire?: string; remuneration?: string; statut?: string; pole?: string;
  categorie?: string; risque?: string; echeance?: string; details?: string;
}): Promise<CommandeResult> {
  if (!data.cible || data.cible.trim().length < 2) return { ok: false, error: "Donne un objet au contrat." };
  return envoyerCommande("contrat.create", { ...data });
}

export async function majContrat(
  id: string,
  patch: {
    cible?: string; commanditaire?: string; remuneration?: string; statut?: string; pole?: string;
    categorie?: string; risque?: string; echeance?: string; details?: string;
  }
): Promise<CommandeResult> {
  if (!id) return { ok: false, error: "Contrat introuvable." };
  return envoyerCommande("contrat.update", { id, ...patch });
}

export async function supprimerContrat(id: string): Promise<CommandeResult> {
  return supprimerFiable({ type: "contrat.delete", payload: { id }, table: "Contrat", colonne: "id", valeur: id, okMsg: "Contrat supprimé." });
}

// Suivi / pipeline (En attente → En cours → Validé → Honoré → Abandonné).
export async function majSuiviContrat(id: string, suivi: string): Promise<CommandeResult> {
  if (!id) return { ok: false, error: "Contrat introuvable." };
  return envoyerCommande("contrat.suivi", { id, suivi });
}

// Honorer : crédite le coffre + crée une facture (via le bot).
export async function honorerContrat(id: string, montant: number): Promise<CommandeResult> {
  if (!id) return { ok: false, error: "Contrat introuvable." };
  // Crédite le coffre + crée une facture → réservé à l'encadrement.
  if (!(await requireOfficier())) return { ok: false, error: "Action réservée aux officiers et à la Direction." };
  const m = Math.round(Number(montant) || 0);
  if (m <= 0) return { ok: false, error: "Indique un montant à verser au coffre." };
  // On ATTEND le verdict réel du bot (évite le « faux succès »).
  return envoyerCommande("contrat.honorer", { id, montant: m }, { attendre: true });
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
  // Retour temps réel : on attend le verdict du bot (MP remis / MP fermés).
  return envoyerCommande("operation.contrat", { ...data, clientDiscordId: did }, { attendre: true });
}
