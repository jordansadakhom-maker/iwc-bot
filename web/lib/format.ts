// Formatage des montants AVEC CENTIMES (2 décimales, séparateur français).
// Ex : cents(1234.5) → "1 234,50". Utilisé partout où un montant est affiché.
export const cents = (n: number | null | undefined) =>
  (Number(n) || 0).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Arrondi au centime — remplace Math.round() pour les montants stockés,
// afin de conserver 2 décimales sans erreurs de virgule flottante.
export const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
