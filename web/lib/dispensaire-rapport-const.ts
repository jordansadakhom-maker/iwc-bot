// Planification du rapport d'impayés — types & libellés PURS (client + serveur).

export type RapportMode = "manuel" | "quotidien" | "hebdo" | "mensuel";
// `joursRetard` = délai (en jours) après l'émission au-delà duquel une facture
// est « en retard » et devient déclarable aux forces de l'ordre. Réglable par la
// Direction, sans toucher au code.
export type RapportConfig = { mode: RapportMode; heure: number; jour: number; joursRetard: number; lastAutoAt: string | null };

export const RAPPORT_CONFIG_DEFAUT: RapportConfig = { mode: "manuel", heure: 8, jour: 1, joursRetard: 3, lastAutoAt: null };
export const RAPPORT_MODES: { key: RapportMode; label: string }[] = [
  { key: "manuel", label: "Manuelle" },
  { key: "quotidien", label: "Chaque jour" },
  { key: "hebdo", label: "Chaque semaine" },
  { key: "mensuel", label: "Chaque mois" },
];
export const JOURS_SEMAINE = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"]; // index 0 = jour 1
export const estModeAuto = (m: RapportMode) => m !== "manuel";
