// Détection de chevauchement de rendez-vous — logique PURE (testable, partagée).
// Un conflit = deux RDV qui se chevauchent dans le temps ET partagent une même
// ressource (le médecin OU la salle). Utilisé pour éviter les doubles réservations.

export function chevauche(aDebut: number, aFin: number, bDebut: number, bFin: number): boolean {
  return aDebut < bFin && bDebut < aFin; // intervalles semi-ouverts [début, fin)
}

// Intervalle [début, début+durée) en millisecondes. Durée par défaut si absente.
export function intervalleRdv(debutISO: string, dureeMin: number | null | undefined, defautMin = 30): { debut: number; fin: number } | null {
  const d = Date.parse(debutISO);
  if (!Number.isFinite(d)) return null;
  const min = dureeMin && dureeMin > 0 ? dureeMin : defautMin;
  return { debut: d, fin: d + min * 60000 };
}

export type RdvExistant = { id: string; debut: string; dureeMin: number | null; medecin: string | null; salle: string | null; etat?: string | null };
export type CibleRdv = { debut: string; dureeMin: number | null; medecin: string | null; salle: string | null; excludeId?: string };

const norm = (x: unknown) => String(x ?? "").trim().toLowerCase();

// RDV existants en conflit avec la cible (même médecin OU salle, créneaux qui se
// chevauchent). Les RDV annulés/terminés sont ignorés.
export function conflitsRdv(cible: CibleRdv, existants: RdvExistant[], defautMin = 30): RdvExistant[] {
  const ci = intervalleRdv(cible.debut, cible.dureeMin, defautMin);
  if (!ci) return [];
  const med = norm(cible.medecin);
  const salle = norm(cible.salle);
  if (!med && !salle) return []; // aucune ressource à protéger
  const out: RdvExistant[] = [];
  for (const e of existants) {
    if (cible.excludeId && e.id === cible.excludeId) continue;
    if (e.etat && /annul|termin|absent/.test(norm(e.etat))) continue;
    const memeMed = !!med && norm(e.medecin) === med;
    const memeSalle = !!salle && norm(e.salle) === salle;
    if (!memeMed && !memeSalle) continue;
    const ei = intervalleRdv(e.debut, e.dureeMin, defautMin);
    if (ei && chevauche(ci.debut, ci.fin, ei.debut, ei.fin)) out.push(e);
  }
  return out;
}
