// Types & constantes des interventions (CRO) — importables CÔTÉ CLIENT.

export type StatutIntervention = "planifiee" | "en_cours" | "terminee" | "annulee";
export const STATUTS_INTERV: StatutIntervention[] = ["planifiee", "en_cours", "terminee", "annulee"];
export const STATUT_INTERV_LABEL: Record<StatutIntervention, string> = { planifiee: "Planifiée", en_cours: "En cours", terminee: "Terminée", annulee: "Annulée" };
export const STATUTS_INTERV_EN_COURS: StatutIntervention[] = ["planifiee", "en_cours"];

export type Intervention = {
  id: string; patient: string; type: string | null; chirurgien: string | null; assistants: string | null; salle: string | null;
  statut: StatutIntervention; debut: string | null; fin: string | null;
  soinsRealises: string | null; complications: string | null; compteRendu: string | null; note: string | null;
  createdAt: string; updatedAt: string | null; updatedBy: string | null;
};

export type InterventionsData = {
  pret: boolean; canEdit: boolean;
  enCours: Intervention[]; recentes: Intervention[];
  patients: string[]; medecins: string[];
};

// Champs éditables du CRO (compte-rendu opératoire).
export const CHAMPS_CRO = ["type", "chirurgien", "assistants", "salle", "soinsRealises", "complications", "compteRendu", "note"] as const;

export function toIntervention(r: Record<string, unknown>): Intervention {
  const statut = (STATUTS_INTERV as string[]).includes(String(r.statut)) ? (String(r.statut) as StatutIntervention) : "planifiee";
  const str = (v: unknown) => (v == null ? null : String(v));
  return {
    id: String(r.id), patient: String(r.patient || "?"), type: str(r.type), chirurgien: str(r.chirurgien), assistants: str(r.assistants), salle: str(r.salle),
    statut, debut: str(r.debut), fin: str(r.fin), soinsRealises: str(r.soinsRealises), complications: str(r.complications), compteRendu: str(r.compteRendu),
    note: str(r.note), createdAt: String(r.createdAt || ""), updatedAt: str(r.updatedAt), updatedBy: str(r.updatedBy),
  };
}
