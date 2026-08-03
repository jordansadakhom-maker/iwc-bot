// Statuts de personnel & départs — module PUR (aucun accès serveur), importable
// côté client comme serveur. Source unique pour « qui est encore dans l'effectif ».

export type StatutDepart = "renvoye" | "demission";

// Un salarié parti (renvoyé OU démissionnaire) ne fait plus partie de l'effectif
// actif : il ne doit plus apparaître dans les rosters, salaires, plannings, etc.
const DEPARTS: Record<string, true> = { renvoye: true, demission: true };
export const estDepart = (statut: unknown): boolean => !!DEPARTS[String(statut || "")];
export const estSalarieActif = (statut: unknown): boolean => !DEPARTS[String(statut || "actif")];

// Libellés & couleurs du type de départ (réutilisés par l'historique du personnel).
export const DEPART_META: Record<StatutDepart, { label: string; court: string; tone: string; emoji: string }> = {
  demission: { label: "Démission", court: "Démissionnaire", tone: "var(--steel)", emoji: "✅" },
  renvoye: { label: "Renvoi", court: "Renvoyé", tone: "var(--oxblood)", emoji: "❌" },
};
