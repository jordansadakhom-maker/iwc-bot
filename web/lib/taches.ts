// Tâches — types & helpers PURS (importables client + serveur, testables).

export type Tache = {
  id: string; titre: string; detail: string | null;
  assigneId: string | null; assigneNom: string | null; pole: string | null;
  priorite: string; echeance: string | null; statut: string;
  source: string | null; creePar: string | null; createdAt: string;
};

export const PRIORITES = [
  { key: "urgente", label: "Urgente", rang: 0, tone: "oxblood" },
  { key: "haute", label: "Haute", rang: 1, tone: "warn" },
  { key: "normale", label: "Normale", rang: 2, tone: "accent" },
  { key: "basse", label: "Basse", rang: 3, tone: "muted" },
] as const;
export const prioriteMeta = (k: string) => PRIORITES.find((p) => p.key === k) || PRIORITES[2];

export const STATUTS_TACHE = [
  { key: "a_faire", label: "À faire" },
  { key: "en_cours", label: "En cours" },
  { key: "faite", label: "Faite" },
] as const;

export const estFaite = (t: Tache) => t.statut === "faite";

// En retard = non faite + échéance dépassée.
export function estEnRetard(t: Tache, now = Date.now()): boolean {
  if (estFaite(t) || !t.echeance) return false;
  const e = new Date(t.echeance).getTime();
  return Number.isFinite(e) && e < now;
}

// Ordre des files : faites en bas ; sinon en retard d'abord, puis priorité,
// puis échéance la plus proche, puis les plus anciennes (ancienneté = urgence).
export function comparerTaches(a: Tache, b: Tache, now = Date.now()): number {
  const fa = estFaite(a), fb = estFaite(b);
  if (fa !== fb) return fa ? 1 : -1;
  const ra = estEnRetard(a, now), rb = estEnRetard(b, now);
  if (ra !== rb) return ra ? -1 : 1;
  const pa = prioriteMeta(a.priorite).rang, pb = prioriteMeta(b.priorite).rang;
  if (pa !== pb) return pa - pb;
  const ea = a.echeance ? new Date(a.echeance).getTime() : Infinity;
  const eb = b.echeance ? new Date(b.echeance).getTime() : Infinity;
  if (ea !== eb) return ea - eb;
  return String(a.createdAt).localeCompare(String(b.createdAt));
}

export function trierTaches(list: Tache[], now = Date.now()): Tache[] {
  return [...list].sort((a, b) => comparerTaches(a, b, now));
}

export function versTache(r: Record<string, unknown>): Tache {
  const s = (v: unknown): string | null => (v == null ? null : String(v));
  return {
    id: String(r.id), titre: String(r.titre || ""), detail: s(r.detail),
    assigneId: s(r.assigneId), assigneNom: s(r.assigneNom), pole: s(r.pole),
    priorite: String(r.priorite || "normale"), echeance: s(r.echeance),
    statut: String(r.statut || "a_faire"), source: s(r.source), creePar: s(r.creePar),
    createdAt: String(r.createdAt || ""),
  };
}
