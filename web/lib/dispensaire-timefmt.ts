// Formatage temporel TOLÉRANT pour les vues du Dispensaire (timeline, main
// courante). Règle d'or : une date invalide ne doit JAMAIS lever d'exception —
// sinon le composant qui l'affiche fait planter tout le rendu serveur (page 500).
// Chaque fonction dégrade proprement vers un repli.

const TZ = "Europe/Paris";
const valide = (d: Date) => !Number.isNaN(d.getTime());

// Séparateur de jour : « Aujourd'hui » / « Hier » / date longue (repli « Plus tôt »).
export function jourRelatif(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  if (!valide(d)) return "Plus tôt";
  try {
    const key = new Intl.DateTimeFormat("fr-FR", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
    const hier = new Date(now); hier.setDate(hier.getDate() - 1);
    if (key.format(d) === key.format(now)) return "Aujourd'hui";
    if (key.format(d) === key.format(hier)) return "Hier";
    return new Intl.DateTimeFormat("fr-FR", { timeZone: TZ, weekday: "long", day: "2-digit", month: "long" }).format(d);
  } catch { return "Plus tôt"; }
}

// Horodatage relatif court : « à l'instant » / « il y a N min » / « il y a N h » ;
// au-delà de 24 h, date + heure. Repli « — » si date invalide.
export function tempsRelatif(iso: string, nowMs: number): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "—";
  const s = Math.max(0, Math.round((nowMs - t) / 1000));
  if (s < 45) return "à l'instant";
  const m = Math.round(s / 60);
  if (m < 60) return `il y a ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `il y a ${h} h`;
  try { return new Intl.DateTimeFormat("fr-FR", { timeZone: TZ, day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso)); } catch { return "—"; }
}

// Heure courte « HH:MM » (repli « — »).
export function heureCourte(iso: string): string {
  try {
    const d = new Date(iso);
    if (!valide(d)) return "—";
    return new Intl.DateTimeFormat("fr-FR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(d);
  } catch { return "—"; }
}
