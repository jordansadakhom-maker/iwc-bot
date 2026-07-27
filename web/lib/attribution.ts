// Attribution assistée — scoring PUR (testable, sans I/O).
// Classe des membres candidats pour une tâche / un contrat non assigné :
// disponibilité (présent > absent), faible charge, pôle correspondant.

export type CandidatMembre = {
  id: string; nom: string; grade: string | null;
  pole: string;      // valeur DB brute : legal / illegal / both / commun / …
  absent: boolean;
  charge: number;    // nb de tâches ouvertes déjà assignées
};

export type ContexteAttribution = {
  pole?: string | null;   // pôle de l'élément : iwc / confrerie / legal / illegal / null
};

export type Suggestion = {
  id: string; nom: string; grade: string | null;
  score: number; charge: number; absent: boolean; raisons: string[];
};

// Vocabulaire de pôle unifié (le site parle iwc/confrerie, la base legal/illegal).
export function normaliserPole(p?: string | null): "legal" | "illegal" | null {
  const s = String(p ?? "").toLowerCase();
  if (s === "iwc" || s === "legal") return "legal";
  if (s === "confrerie" || s === "illegal") return "illegal";
  return null;
}

export function scorerCandidat(c: CandidatMembre, ctx: ContexteAttribution): Suggestion {
  const raisons: string[] = [];
  let score = 100;

  if (c.absent) { score -= 1000; raisons.push("Absent — déconseillé"); }
  else raisons.push("Disponible");

  score -= c.charge * 10;
  raisons.push(c.charge === 0 ? "Aucune tâche en cours" : `${c.charge} tâche(s) en cours`);

  const veut = normaliserPole(ctx.pole);
  const a = normaliserPole(c.pole);
  if (veut) {
    if (a === veut) { score += 15; raisons.push("Pôle correspondant"); }
    else if (a && a !== veut) { score -= 20; raisons.push("Autre pôle"); }
  }

  return { id: c.id, nom: c.nom, grade: c.grade, score, charge: c.charge, absent: c.absent, raisons };
}

// Meilleur score d'abord ; à égalité, la charge la plus faible puis l'ordre alpha.
export function comparerSuggestions(a: Suggestion, b: Suggestion): number {
  if (a.score !== b.score) return b.score - a.score;
  if (a.charge !== b.charge) return a.charge - b.charge;
  return a.nom.localeCompare(b.nom);
}

export function suggererAssignation(candidats: CandidatMembre[], ctx: ContexteAttribution = {}, n = 4): Suggestion[] {
  return candidats.map((c) => scorerCandidat(c, ctx)).sort(comparerSuggestions).slice(0, Math.max(0, n));
}
