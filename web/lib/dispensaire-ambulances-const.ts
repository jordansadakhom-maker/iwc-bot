// Types & constantes des ambulances — importables CÔTÉ CLIENT.

export type EtatAmbulance = "disponible" | "en_intervention" | "entretien" | "hs";
export const ETATS_AMBULANCE: EtatAmbulance[] = ["disponible", "en_intervention", "entretien", "hs"];
export const ETAT_AMBULANCE_LABEL: Record<EtatAmbulance, string> = { disponible: "Disponible", en_intervention: "En intervention", entretien: "Entretien", hs: "Hors service" };
export const ETAT_AMBULANCE_TON: Record<EtatAmbulance, string> = { disponible: "var(--good)", en_intervention: "var(--accent)", entretien: "var(--warn)", hs: "var(--oxblood)" };

export type Ambulance = {
  id: string; nom: string; etat: EtatAmbulance;
  essence: number | null; kilometrage: number | null; materiel: string | null; dernierEntretien: string | null; note: string | null;
  updatedAt: string | null; updatedBy: string | null;
};

export type AmbulancesData = {
  pret: boolean; canEdit: boolean;
  ambulances: Ambulance[]; stats: Record<EtatAmbulance, number>;
};

export function toAmbulance(r: Record<string, unknown>): Ambulance {
  const etat = (ETATS_AMBULANCE as string[]).includes(String(r.etat)) ? (String(r.etat) as EtatAmbulance) : "disponible";
  const str = (v: unknown) => (v == null ? null : String(v));
  const int = (v: unknown) => (v == null || v === "" ? null : Number(v) || 0);
  return {
    id: String(r.id), nom: String(r.nom || "?"), etat,
    essence: int(r.essence), kilometrage: int(r.kilometrage), materiel: str(r.materiel), dernierEntretien: str(r.dernierEntretien), note: str(r.note),
    updatedAt: str(r.updatedAt), updatedBy: str(r.updatedBy),
  };
}
