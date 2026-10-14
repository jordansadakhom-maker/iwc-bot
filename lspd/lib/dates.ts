// Service de dates — fuseau de référence (configurable via LSPD_TZ, défaut Paris).
const TZ = (process.env.LSPD_TZ || "Europe/Paris").trim() || "Europe/Paris";

export function ymd(input: string | Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(input));
}

export function dateFR(input: string | Date | null): string {
  if (!input) return "—";
  try {
    return new Intl.DateTimeFormat("fr-FR", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(input));
  } catch {
    return "—";
  }
}

export function dateHeureFR(input: string | Date | null): string {
  if (!input) return "—";
  try {
    return new Intl.DateTimeFormat("fr-FR", { timeZone: TZ, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(input));
  } catch {
    return "—";
  }
}
