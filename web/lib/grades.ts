// Grades attribuables depuis le site (miroir des GRADES_LEGAL/GRADES_ILLEGAL du
// bot, notion-modules-v3.js). Les libellés doivent correspondre EXACTEMENT à ceux
// du bot (résolution par nom → rôle Discord). « Fondateur » n'est pas listé :
// c'est un rôle au sommet, non attribuable par le bot (hiérarchie).
export type GradeOption = { nom: string; emoji: string; pole: "legal" | "illegal" };

export const GRADES_LEGAL: GradeOption[] = [
  { nom: "Le Conseil — Directeur", emoji: "👑", pole: "legal" },
  { nom: "Officier de Terrain", emoji: "🎖️", pole: "legal" },
  { nom: "Agent Confirmé", emoji: "🔵", pole: "legal" },
  { nom: "Opérateur", emoji: "🟢", pole: "legal" },
  { nom: "Recrue — Probatoire", emoji: "⚪", pole: "legal" },
];

export const GRADES_ILLEGAL: GradeOption[] = [
  { nom: "Le Concepteur", emoji: "💀", pole: "illegal" },
  { nom: "Le Fléau", emoji: "⚔️", pole: "illegal" },
  { nom: "L'Exécuteur", emoji: "🗡️", pole: "illegal" },
  { nom: "Le Condamné", emoji: "🔴", pole: "illegal" },
  { nom: "Le Maudit", emoji: "🟤", pole: "illegal" },
];

export const TOUS_GRADES: GradeOption[] = [...GRADES_LEGAL, ...GRADES_ILLEGAL];
