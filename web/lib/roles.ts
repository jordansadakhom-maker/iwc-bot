// Source UNIQUE de la dérivation des rôles & métiers à partir du grade (Discord),
// de la fiche RH et de l'appartenance au roster de l'Armurerie.
//
// Module PUR (aucune dépendance serveur) → importable partout : navigation
// (getAcces), écritures (getActeur) et carte métier (metiersDe). Avant ce module,
// la MÊME règle regex était copiée-collée dans authz.ts, queries.ts et
// carte-metier.ts (3 exemplaires à maintenir) — source garantie de désynchro dès
// qu'un grade était renommé. Ici, une seule vérité.

const RE_DIRECTION = /fondateur|conseil|directeur|fl[eé]au|concepteur/;
const RE_OFFICIER = /officier|instructeur/;
const RE_INSTRUCTEUR = /instructeur/;
const RE_INSTRUCT_SPEC = /instruct/;
const RE_MEDECINE = /m[eé]dec|infirm|docteur|toubib|chirurg/;
const RE_ARMUR = /armur/;
const RE_TERRAIN = /officier|agent|op[eé]rateur|recrue|terrain/;

const bas = (x: unknown): string => String(x ?? "").toLowerCase();

/** Direction (fondateur, conseil, directeur, fléau, concepteur). */
export function estDirection(grade: unknown): boolean {
  return RE_DIRECTION.test(bas(grade));
}

/** Officier — encadrement du terrain (inclut la Direction). */
export function estOfficier(grade: unknown): boolean {
  const g = bas(grade);
  return RE_DIRECTION.test(g) || RE_OFFICIER.test(g);
}

/**
 * Armurier DÉDUIT DU GRADE seulement (Direction ou grade « armur… »).
 * Le roster nominatif (table ArmurerieEmploye) est ajouté côté serveur, là où il
 * est lisible — voir getAcces (queries.ts) et getCarteMetier (carte-metier-data.ts).
 */
export function estArmurierGrade(grade: unknown): boolean {
  const g = bas(grade);
  return RE_DIRECTION.test(g) || RE_ARMUR.test(g);
}

/** Entrée générique pour dériver les métiers occupés par un membre. */
export type MetierEntree = {
  grade?: unknown;
  specialite?: unknown;
  medecin?: boolean;
  armurierRoster?: boolean; // présent au roster ArmurerieEmploye (résolu côté serveur)
};

/**
 * Métiers occupés par un membre (peut en cumuler plusieurs). Règle UNIQUE,
 * partagée par la carte métier et les prédicats d'accès. `armurierRoster` lève la
 * désynchro « employé d'armurerie sans "armur" dans son grade ».
 */
export function metiersDe(m: MetierEntree): string[] {
  const g = bas(m.grade);
  const spec = bas(m.specialite);
  const out = new Set<string>();
  if (estDirection(g)) out.add("direction");
  if (estOfficier(g)) out.add("officier");
  if (RE_INSTRUCTEUR.test(g) || RE_INSTRUCT_SPEC.test(spec)) out.add("instruction");
  if (m.medecin || RE_MEDECINE.test(spec)) out.add("medecine");
  if (RE_ARMUR.test(g) || RE_ARMUR.test(spec) || m.armurierRoster) out.add("armurerie");
  if (RE_TERRAIN.test(g)) out.add("terrain");
  return [...out];
}

/** Normalisation d'un nom pour rapprochement roster (accents/casse/espaces ignorés). */
export function normNom(x: unknown): string {
  return String(x ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
}
