// Assistant / moteur de veille — types & helpers PURS (importables côté client).
// Un « constat » = quelque chose que le système a détecté dans les VRAIES données
// et qui mérite ton attention, avec une action suggérée. Aucune donnée inventée :
// chaque constat est dérivé de l'existant (stocks, pointages, contrats, coffres…).

export type Gravite = "critique" | "important" | "info";

export type Constat = {
  id: string;
  gravite: Gravite;
  categorie: string;     // Stock · Coffre · RH · Contrats · Impôts…
  titre: string;         // constat court
  detail: string | null; // précision chiffrée
  suggestion: string;    // action proposée (jamais exécutée sans toi)
  href: string;          // lien direct vers l'élément concerné
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
