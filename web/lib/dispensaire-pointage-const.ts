// Pointage hybride — états & statuts. Module PUR (aucun accès serveur), donc
// importable côté client comme serveur, et testable unitairement.

// Origine de la clôture d'un service.
export type FinSource = "normal" | "oubli" | "user" | "direction";
// État « vivant » d'un service.
export type EtatService = "en_service" | "a_confirmer" | "cloture";

// Un service compte-t-il pour la PAIE ? Règle robuste même AVANT la migration SQL :
// un service clôturé (fin renseignée) est validé, sauf s'il est EXPLICITEMENT
// marqué non validé (valide === false). Un service ouvert (fin absente) n'est
// JAMAIS payé — on ne compte jamais du temps « ouvert ».
export function estValide(s: { fin: string | null; valide?: boolean | null }): boolean {
  if (!s.fin) return false;
  return s.valide !== false;
}

// Un service OUVERT est-il « à confirmer » (plus aucun signal récent du navigateur) ?
// Basé sur `lastSeen` (heartbeat) si présent, sinon sur le début du service.
// `seuilMin` = minutes d'inactivité tolérées (réglage Direction).
export function estAConfirmer(s: { fin: string | null; lastSeen?: string | null; debut: string }, seuilMin: number, now: number = Date.now()): boolean {
  if (s.fin) return false; // déjà clôturé
  const ref = s.lastSeen || s.debut;
  const t = Date.parse(ref);
  if (!Number.isFinite(t)) return false;
  return now - t > Math.max(1, seuilMin) * 60000;
}

// Un service ouvert doit-il remonter à la Direction (ouvert depuis > escalade) ?
export function estEscalade(s: { fin: string | null; debut: string }, escaladeH: number, now: number = Date.now()): boolean {
  if (s.fin) return false;
  const t = Date.parse(s.debut);
  if (!Number.isFinite(t)) return false;
  return now - t > Math.max(1, escaladeH) * 3600000;
}

// Statut affiché (badge) d'un service : combine ouvert / à-confirmer et la source
// de clôture (normal / oubli / user / direction).
export type StatutService = "en_service" | "a_confirmer" | "normal" | "oubli" | "user" | "direction";
export function statutDe(s: { fin: string | null; lastSeen?: string | null; debut: string; finSource?: string | null }, seuilMin: number, now: number = Date.now()): StatutService {
  if (!s.fin) return estAConfirmer(s, seuilMin, now) ? "a_confirmer" : "en_service";
  const src = (s.finSource || "normal") as StatutService;
  return src in STATUT_META ? src : "normal";
}

export const STATUT_META: Record<StatutService, { label: string; icon: string; tone: string }> = {
  en_service: { label: "En service", icon: "🟢", tone: "var(--good)" },
  a_confirmer: { label: "À confirmer", icon: "⏳", tone: "var(--warn)" },
  normal: { label: "Clôturé", icon: "✔", tone: "var(--good)" },
  oubli: { label: "Clôturé après oubli", icon: "⚠", tone: "var(--warn)" },
  user: { label: "Corrigé (salarié)", icon: "👤", tone: "var(--accent)" },
  direction: { label: "Corrigé (Direction)", icon: "🛡", tone: "var(--oxblood)" },
};
