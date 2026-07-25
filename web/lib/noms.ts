// Normalisation de nom pour APPARIEMENT (clé de rapprochement) — SOURCE UNIQUE.
// Minuscules, sans accents, sans espaces ni ponctuation :
//   « Léa D'Arcy », « lea  darcy », « LEA-DARCY » → tous « leadarcy ».
// Utilisée partout où l'on rapproche deux enregistrements par nom (RH ↔ accès au
// site, ressources de chasse, réconciliations…). Ne PAS en refaire une copie
// locale : une règle qui diverge d'un module à l'autre = des doublons silencieux
// (un patient dupliqué) ou un trou de sécurité (un renvoyé qui « ne matche pas »).
export const cleNom = (v: unknown): string =>
  String(v ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
