"use server";

import { construireContexte, interpreter, TYPES_AUTORISES, type Action, type Interpretation } from "@/lib/assistant";
import { envoyerCommande } from "@/lib/commandes";
import { supprimerFiable } from "@/lib/suppression";
import { iaTexte } from "@/lib/ia";

// Suppressions via l'IA : elles doivent passer par le helper FIABLE (attend le
// bot + retire la ligne en base), sinon la réconciliation ré-ajoute l'élément —
// exactement comme les suppressions des autres onglets.
const DELETE_MAP: Record<string, { table: string; colonne: string; cle: string; msg: string }> = {
  "operation.delete": { table: "Operation", colonne: "id", cle: "id", msg: "Opération supprimée." },
  "contrat.delete": { table: "Contrat", colonne: "id", cle: "id", msg: "Contrat supprimé." },
  "rapport.delete": { table: "RapportInfo", colonne: "id", cle: "id", msg: "Rapport supprimé." },
  "traque.delete": { table: "Traque", colonne: "id", cle: "id", msg: "Traque supprimée." },
  "contact.delete": { table: "Contact", colonne: "id", cle: "id", msg: "Contact supprimé." },
  "medical.delete": { table: "DossierMedical", colonne: "membreId", cle: "membreId", msg: "Dossier supprimé." },
};

// Recherche / question en langage naturel : l'IA répond à partir des VRAIES
// données de la compagnie (aucune action, lecture seule). « Quels contrats
// Confrérie en attente ? », « Qui est absent cette semaine ? »…
export async function repondreQuestion(question: string): Promise<{ ok: boolean; texte?: string; error?: string }> {
  const q = String(question || "").trim();
  if (q.length < 3) return { ok: false, error: "Pose une question un peu plus précise." };
  if (q.length > 500) return { ok: false, error: "Question trop longue." };
  const ctx = await construireContexte();
  const system = "Tu es l'assistant de la Iron Wolf Company (univers western RP). On te fournit les données réelles de la compagnie en JSON et une question. Réponds en français, de façon concise et factuelle, en te basant UNIQUEMENT sur ces données. Si l'information n'y figure pas, dis-le simplement. N'invente jamais de chiffre ni de nom.";
  const r = await iaTexte(system, `DONNÉES RÉELLES :\n${JSON.stringify(ctx)}\n\nQUESTION : ${q}`, 700);
  return r.ok ? { ok: true, texte: r.texte } : { ok: false, error: r.error };
}

// Interprète un ordre en langage naturel → liste d'actions à confirmer.
export async function demander(instruction: string): Promise<Interpretation> {
  const inst = (instruction || "").trim();
  if (inst.length < 3) return { ok: false, error: "Écris un ordre un peu plus précis." };
  if (inst.length > 2000) return { ok: false, error: "Ordre trop long." };
  const contexte = await construireContexte();
  return interpreter(inst, contexte);
}

// Exécute les actions confirmées : chaque action passe par la file de commandes.
export async function executer(actions: Action[]): Promise<{ ok: boolean; executees: number; echecs: number; error?: string }> {
  if (!Array.isArray(actions) || !actions.length) return { ok: false, executees: 0, echecs: 0, error: "Aucune action à exécuter." };
  let executees = 0, echecs = 0;
  for (const a of actions) {
    if (!a || !TYPES_AUTORISES.has(a.type)) { echecs++; continue; }
    const payload = (a.payload && typeof a.payload === "object" ? a.payload : {}) as Record<string, unknown>;
    const del = DELETE_MAP[a.type];
    if (del) {
      // Suppression fiable (attend le verdict du bot + retrait direct en base).
      const valeur = String(payload[del.cle] ?? "");
      const r = await supprimerFiable({ type: a.type, payload, table: del.table, colonne: del.colonne, valeur, okMsg: del.msg });
      if (r.ok) executees++; else echecs++;
      continue;
    }
    const r = await envoyerCommande(a.type, payload);
    if (r.ok) executees++; else echecs++;
  }
  return { ok: executees > 0, executees, echecs };
}
