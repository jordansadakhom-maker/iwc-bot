// Types & constantes des chambres — importables CÔTÉ CLIENT.

export type EtatChambre = "libre" | "occupee" | "reservee" | "nettoyage";
export const ETATS_CHAMBRE: EtatChambre[] = ["libre", "occupee", "reservee", "nettoyage"];
export const ETAT_CHAMBRE_LABEL: Record<EtatChambre, string> = { libre: "Libre", occupee: "Occupée", reservee: "Réservée", nettoyage: "Nettoyage" };
export const ETAT_CHAMBRE_TON: Record<EtatChambre, string> = { libre: "var(--good)", occupee: "var(--oxblood)", reservee: "var(--warn)", nettoyage: "var(--steel)" };

export type Chambre = {
  id: string; nom: string; type: string | null; etat: EtatChambre;
  patient: string | null; medecin: string | null; depuis: string | null; note: string | null;
  updatedAt: string | null; updatedBy: string | null;
};

export type ChambresData = {
  pret: boolean; canEdit: boolean;
  chambres: Chambre[]; patients: string[]; medecins: string[];
  stats: Record<EtatChambre, number>;
};

export function toChambre(r: Record<string, unknown>): Chambre {
  const etat = (ETATS_CHAMBRE as string[]).includes(String(r.etat)) ? (String(r.etat) as EtatChambre) : "libre";
  const str = (v: unknown) => (v == null ? null : String(v));
  return {
    id: String(r.id), nom: String(r.nom || "?"), type: str(r.type), etat,
    patient: str(r.patient), medecin: str(r.medecin), depuis: str(r.depuis), note: str(r.note),
    updatedAt: str(r.updatedAt), updatedBy: str(r.updatedBy),
  };
}
