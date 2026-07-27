// Types & constantes des rendez-vous — importables CÔTÉ CLIENT.

export type EtatRDV = "prevu" | "honore" | "absent" | "annule";
export const ETATS_RDV: EtatRDV[] = ["prevu", "honore", "absent", "annule"];
export const ETAT_RDV_LABEL: Record<EtatRDV, string> = { prevu: "Prévu", honore: "Honoré", absent: "Absent", annule: "Annulé" };

export type Priorite = "basse" | "normale" | "haute" | "urgente";
export const PRIORITES: Priorite[] = ["basse", "normale", "haute", "urgente"];
export const PRIORITE_LABEL: Record<Priorite, string> = { basse: "Basse", normale: "Normale", haute: "Haute", urgente: "Urgente" };
export const PRIORITE_TON: Record<Priorite, string> = { basse: "var(--muted)", normale: "var(--accent)", haute: "var(--warn)", urgente: "var(--oxblood)" };

export type RendezVous = {
  id: string; patient: string; type: string | null; medecin: string | null; salle: string | null;
  priorite: Priorite; debut: string; dureeMin: number | null; etat: EtatRDV;
  motif: string | null; note: string | null; updatedAt: string | null; updatedBy: string | null;
};

export type RendezVousData = {
  pret: boolean; canEdit: boolean;
  aVenir: RendezVous[]; passes: RendezVous[];
  patients: string[]; medecins: string[];
};

export function toRDV(r: Record<string, unknown>): RendezVous {
  const etat = (ETATS_RDV as string[]).includes(String(r.etat)) ? (String(r.etat) as EtatRDV) : "prevu";
  const priorite = (PRIORITES as string[]).includes(String(r.priorite)) ? (String(r.priorite) as Priorite) : "normale";
  const str = (v: unknown) => (v == null ? null : String(v));
  return {
    id: String(r.id), patient: String(r.patient || "?"), type: str(r.type), medecin: str(r.medecin), salle: str(r.salle),
    priorite, debut: String(r.debut || ""), dureeMin: r.dureeMin == null ? null : Number(r.dureeMin) || 0, etat,
    motif: str(r.motif), note: str(r.note), updatedAt: str(r.updatedAt), updatedBy: str(r.updatedBy),
  };
}
