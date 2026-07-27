// Service de dates UNIQUE du Dispensaire — semaine civile & jour « Paris ».
// Remplace les 7 réimplémentations quasi-identiques (facturation, notifications,
// accueil, stats, pointage…) qui divergeaient légèrement. Fonctions pures (Intl),
// utilisables côté serveur comme client.

export const PARIS = "Europe/Paris";

// Date civile à Paris au format ISO court « YYYY-MM-DD » pour un instant donné
// (défaut : maintenant). Sert de clé de regroupement par jour partout.
export function ymdParis(input: string | Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: PARIS, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(input));
}

// Jour de la semaine à Paris, 0 = lundi … 6 = dimanche.
const JOURS: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
export function dowParis(input: string | Date = new Date()): number {
  const j = new Intl.DateTimeFormat("en-GB", { timeZone: PARIS, weekday: "short" }).format(new Date(input));
  return JOURS[j] ?? 0;
}

// Lundi (YYYY-MM-DD, date civile Paris) de la semaine contenant `now`. Ancré à
// midi UTC pour rester à l'abri des bascules d'heure d'été/hiver.
export function lundiCourant(now: string | Date = new Date()): string {
  const base = new Date(ymdParis(now) + "T12:00:00Z");
  base.setUTCDate(base.getUTCDate() - dowParis(now));
  return base.toISOString().slice(0, 10);
}
