"use server";

import { construireContexte, interpreter, TYPES_AUTORISES, type Action, type Interpretation } from "@/lib/assistant";
import { envoyerCommande } from "@/lib/commandes";

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
    const r = await envoyerCommande(a.type, payload);
    if (r.ok) executees++; else echecs++;
  }
  return { ok: executees > 0, executees, echecs };
}
