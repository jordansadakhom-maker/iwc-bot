// Types & constantes des prises en charge — importables CÔTÉ CLIENT (pas de
// dépendance serveur). La logique de lecture vit dans dispensaire-prises-en-charge.ts.

export type EtatPEC = "admis" | "en_soin" | "termine" | "annule";
export const ETATS_PEC: EtatPEC[] = ["admis", "en_soin", "termine", "annule"];
export const ETAT_PEC_LABEL: Record<EtatPEC, string> = { admis: "Admis", en_soin: "En soin", termine: "Terminé", annule: "Annulé" };
export const ETATS_EN_COURS: EtatPEC[] = ["admis", "en_soin"];

export type PriseEnCharge = {
  id: string; patient: string; motif: string | null; medecin: string | null;
  etat: EtatPEC; note: string | null; factureId: string | null;
  admisAt: string; soinAt: string | null; finAt: string | null;
  updatedAt: string | null; updatedBy: string | null;
  // Facture liée (rattachée à la lecture pour les épisodes terminés) : permet
  // d'encaisser depuis le tableau. `null` si aucune facture ou non résolue.
  facture?: { montant: number; payee: boolean } | null;
};

export type PrisesEnChargeData = {
  pret: boolean; canEdit: boolean; canSoigner: boolean; canFacturer: boolean;
  enCours: PriseEnCharge[]; recentes: PriseEnCharge[];
  patients: string[]; medecins: string[];
};

const str = (v: unknown) => (v == null ? null : String(v));
export function toPEC(r: Record<string, unknown>): PriseEnCharge {
  const etat = (ETATS_PEC as string[]).includes(String(r.etat)) ? (String(r.etat) as EtatPEC) : "admis";
  return {
    id: String(r.id), patient: String(r.patient || "?"), motif: str(r.motif), medecin: str(r.medecin),
    etat, note: str(r.note), factureId: str(r.factureId),
    admisAt: String(r.admisAt || r.createdAt || ""), soinAt: str(r.soinAt), finAt: str(r.finAt),
    updatedAt: str(r.updatedAt), updatedBy: str(r.updatedBy),
  };
}
