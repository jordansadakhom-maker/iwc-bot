// Planification du rapport d'impayés — types & libellés PURS (client + serveur).

export type RapportMode = "manuel" | "quotidien" | "hebdo" | "mensuel";
export type RapportConfig = { mode: RapportMode; heure: number; jour: number; lastAutoAt: string | null };

export const RAPPORT_CONFIG_DEFAUT: RapportConfig = { mode: "manuel", heure: 8, jour: 1, lastAutoAt: null };
export const RAPPORT_MODES: { key: RapportMode; label: string }[] = [
  { key: "manuel", label: "Manuelle" },
  { key: "quotidien", label: "Chaque jour" },
  { key: "hebdo", label: "Chaque semaine" },
  { key: "mensuel", label: "Chaque mois" },
];
export const JOURS_SEMAINE = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"]; // index 0 = jour 1
export const estModeAuto = (m: RapportMode) => m !== "manuel";
