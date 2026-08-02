// Règle de calcul du salaire — module PUR (aucun accès serveur), donc testable
// unitairement et importable côté client comme serveur.
//
// RÈGLE (à partir du Lot « refonte salaires ») :
//   • Les jours ne comptent que s'ils sont POINTÉS (fin de service enregistrée).
//   • Dès 4 jours pointés dans la semaine → salaire PLEIN, automatiquement.
//   • En deçà de 4 jours → salaire au prorata (jours / 4).
//   • Au-delà de 4 jours → plafonné au salaire plein (travailler plus ne rapporte
//     pas davantage).
//
//   Exemple pour un barème plein M :
//     1 j → M×1/4   2 j → M×2/4   3 j → M×3/4   4 j → M   5/6/7 j → M
export const SEUIL_JOURS_PLEIN = 4;

export function calculerSalaire(montantHebdo: number, jours: number): number {
  const base = Math.max(0, Number(montantHebdo) || 0);
  const j = Math.max(0, Math.floor(Number(jours) || 0));
  if (base <= 0 || j <= 0) return 0;
  const part = Math.min(j, SEUIL_JOURS_PLEIN) / SEUIL_JOURS_PLEIN;
  return Math.round(base * part);
}

// Un salarié a-t-il atteint le seuil du salaire plein cette semaine ?
export const salairePlein = (jours: number) => Math.floor(Number(jours) || 0) >= SEUIL_JOURS_PLEIN;

// Jours RETENUS pour la paie = jours détectés au pointage + ajustement manuel de
// la Direction (peut être négatif), borné à 0.
export const joursRetenus = (joursAuto: number, ajust: number) =>
  Math.max(0, (Math.floor(Number(joursAuto) || 0)) + Math.round(Number(ajust) || 0));

// Salaire FINAL = salaire calculé (sur les jours retenus) + prime manuelle.
export function salaireFinal(montantHebdo: number, joursRetenusVal: number, prime: number): number {
  return calculerSalaire(montantHebdo, joursRetenusVal) + Math.max(0, Math.round(Number(prime) || 0));
}
