// Assistant / moteur de veille — types & helpers PURS (importables côté client).
// Un « constat » = quelque chose que le système a détecté dans les VRAIES données
// et qui mérite ton attention, avec une action suggérée. Aucune donnée inventée :
// chaque constat est dérivé de l'existant (stocks, pointages, contrats, coffres…).

export type Gravite = "critique" | "important" | "info";

// Priorité fine (6 niveaux) — porte le rang réel de chaque constat. La gravité
// (3 bandes) en est dérivée pour l'affichage groupé.
export type Priorite = "information" | "faible" | "normale" | "importante" | "urgente" | "critique";
export const PRIORITE_ORDRE: Record<Priorite, number> = { critique: 0, urgente: 1, importante: 2, normale: 3, faible: 4, information: 5 };
export const PRIORITE_LABEL: Record<Priorite, string> = { critique: "Critique", urgente: "Urgente", importante: "Importante", normale: "Normale", faible: "Faible", information: "Information" };
export const PRIORITE_TON: Record<Priorite, string> = { critique: "var(--oxblood)", urgente: "var(--oxblood)", importante: "var(--warn)", normale: "var(--accent)", faible: "var(--steel)", information: "var(--muted)" };
export function graviteDe(p: Priorite): Gravite { if (p === "critique" || p === "urgente") return "critique"; if (p === "importante" || p === "normale") return "important"; return "info"; }

// État du cycle de vie d'une notification (couche persistée par-dessus le constat).
export type Etat = "nouveau" | "en_cours" | "resolu" | "archive";
export const ETATS: Etat[] = ["nouveau", "en_cours", "resolu", "archive"];
export const ETAT_LABEL: Record<Etat, string> = { nouveau: "Non lue", en_cours: "En cours", resolu: "Résolue", archive: "Archivée" };
export const ETAT_TON: Record<Etat, string> = { nouveau: "var(--accent)", en_cours: "var(--warn)", resolu: "var(--good)", archive: "var(--muted)" };
export const ETAT_ACTIFS: Etat[] = ["nouveau", "en_cours"]; // affichés par défaut
// Escalade : un point critique/urgent encore « Non lu » remonte de lui-même.
export function estEscalade(c: { priorite: Priorite; etat?: Etat }): boolean {
  return (c.etat ?? "nouveau") === "nouveau" && (c.priorite === "critique" || c.priorite === "urgente");
}

export type Constat = {
  id: string;
  gravite: Gravite;
  priorite: Priorite;
  categorie: string;     // Stock · Coffre · RH · Contrats · Impôts…
  titre: string;         // constat court
  detail: string | null; // précision chiffrée
  suggestion: string;    // action proposée (jamais exécutée sans toi)
  href: string;          // lien direct vers l'élément concerné
  etat?: Etat;           // couche persistée (défaut « nouveau »)
};

export type AssistantData = {
  pret: boolean;
  constats: Constat[];
  parGravite: { critique: number; important: number; info: number };
  genereLe: string;      // horodatage formaté côté serveur (évite tout décalage d'hydratation)
};

export const GRAVITE_ORDRE: Record<Gravite, number> = { critique: 0, important: 1, info: 2 };
export const GRAVITE_TON: Record<Gravite, string> = { critique: "var(--oxblood)", important: "var(--warn)", info: "var(--accent)" };
export const GRAVITE_LABEL: Record<Gravite, string> = { critique: "Critique", important: "À traiter", info: "Information" };

export const trierConstats = (cs: Constat[]) => [...cs].sort((a, b) => GRAVITE_ORDRE[a.gravite] - GRAVITE_ORDRE[b.gravite]);

// Compteurs par gravité.
export function compterGravite(cs: Constat[]): AssistantData["parGravite"] {
  return { critique: cs.filter((c) => c.gravite === "critique").length, important: cs.filter((c) => c.gravite === "important").length, info: cs.filter((c) => c.gravite === "info").length };
}

// Rapport auto d'une phrase — le « résumé du jour ».
export function resumeAuto(cs: Constat[]): string {
  if (!cs.length) return "Rien à signaler — tout est à jour.";
  const g = compterGravite(cs);
  const bouts: string[] = [];
  if (g.critique) bouts.push(`${g.critique} point${g.critique > 1 ? "s" : ""} critique${g.critique > 1 ? "s" : ""}`);
  if (g.important) bouts.push(`${g.important} à traiter`);
  if (g.info) bouts.push(`${g.info} info${g.info > 1 ? "s" : ""}`);
  const tete = trierConstats(cs)[0];
  return `${bouts.join(" · ")} — en priorité : ${tete.titre}.`;
}
