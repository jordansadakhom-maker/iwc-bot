// ═══════════════════════════════════════════════════════════════════════════
//  Cœur du MODE AUDIT — types & barème de score, partagés par les deux
//  écosystèmes (site principal IWC/Armurerie/Licences et Dispensaire).
//  Module pur (ni « server-only » ni « use client ») : utilisable des deux côtés.
// ═══════════════════════════════════════════════════════════════════════════

export type Gravite = "critique" | "majeur" | "mineur" | "info";

export const GRAVITE_POIDS: Record<Gravite, number> = { critique: 25, majeur: 10, mineur: 3, info: 0 };
export const GRAVITE_LABEL: Record<Gravite, string> = { critique: "Critique", majeur: "Majeur", mineur: "Mineur", info: "Info" };
export const GRAVITE_TON: Record<Gravite, string> = { critique: "var(--oxblood)", majeur: "var(--warn)", mineur: "var(--accent)", info: "var(--muted)" };
export const ORDRE_GRAVITE: Record<Gravite, number> = { critique: 0, majeur: 1, mineur: 2, info: 3 };

export type Anomalie = { categorie: string; gravite: Gravite; titre: string; detail: string; suggestion?: string; ref?: string };
export type CategorieScore = { categorie: string; score: number; anomalies: number; critiques: number };
export type ChecklistItem = { id: string; groupe: string; libelle: string };

export type RapportAudit = {
  genereLe: string;
  pret: boolean;               // les tables sont-elles accessibles ?
  canVoir: boolean;            // le compte a-t-il le droit de voir l'audit ?
  scoreGlobal: number;
  totalControles: number;      // nombre de contrôles exécutés
  categories: CategorieScore[];
  anomalies: Anomalie[];
  checklist: ChecklistItem[];
};

// Barème : chaque catégorie part de 100 et perd le poids de chacune de ses
// anomalies (planché à 0). Le score global est la moyenne des catégories.
export function scorer(categories: string[], anomalies: Anomalie[]): { categories: CategorieScore[]; scoreGlobal: number } {
  const cats: CategorieScore[] = categories.map((c) => {
    const list = anomalies.filter((a) => a.categorie === c);
    const perte = list.reduce((s, a) => s + GRAVITE_POIDS[a.gravite], 0);
    return { categorie: c, score: Math.max(0, 100 - perte), anomalies: list.length, critiques: list.filter((a) => a.gravite === "critique").length };
  });
  const scoreGlobal = cats.length ? Math.round(cats.reduce((s, c) => s + c.score, 0) / cats.length) : 100;
  return { categories: cats, scoreGlobal };
}

// Trie les anomalies de la plus grave à la moins grave.
export const trierAnomalies = (a: Anomalie[]): Anomalie[] => [...a].sort((x, y) => ORDRE_GRAVITE[x.gravite] - ORDRE_GRAVITE[y.gravite]);

export const tonScore = (s: number): string => (s >= 95 ? "var(--good)" : s >= 80 ? "var(--warn)" : "var(--oxblood)");
