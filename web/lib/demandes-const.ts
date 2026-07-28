// ═══════════════════════════════════════════════════════════════════════════
//  DEMANDES (tickets) — socle DOMAINE, importable client ET serveur.
//  Chaque « demande » unifie tout ce qui arrive à l'IWC (RH, prestation,
//  signalement, opération, facture, commande, RDV, télégramme…) en un dossier
//  avec conversation, statut, attribution et historique — traité sur le SITE.
//  Discord ne sert qu'à notifier (lien profond vers /demandes/<id>).
// ═══════════════════════════════════════════════════════════════════════════

// ── Statuts ──────────────────────────────────────────────────────────────────
export type StatutDemande =
  | "nouvelle" | "en_attente" | "en_cours" | "infos" | "attente_tiers"
  | "terminee" | "refusee" | "archivee";

export const STATUTS_DEMANDE: { key: StatutDemande; label: string; tone: string; ouvert: boolean }[] = [
  { key: "nouvelle",      label: "Nouvelle",                    tone: "var(--accent)",  ouvert: true },
  { key: "en_attente",    label: "En attente",                  tone: "var(--warn)",    ouvert: true },
  { key: "en_cours",      label: "En cours de traitement",      tone: "var(--good)",    ouvert: true },
  { key: "infos",         label: "Infos complémentaires",       tone: "var(--warn)",    ouvert: true },
  { key: "attente_tiers", label: "En attente d'un tiers",       tone: "var(--steel)",   ouvert: true },
  { key: "terminee",      label: "Terminée",                    tone: "var(--good)",    ouvert: false },
  { key: "refusee",       label: "Refusée",                     tone: "var(--oxblood)", ouvert: false },
  { key: "archivee",      label: "Archivée",                    tone: "var(--muted)",   ouvert: false },
];
export const statutDemandeDef = (k: string) => STATUTS_DEMANDE.find((s) => s.key === k) || STATUTS_DEMANDE[0];
export const STATUTS_OUVERTS = STATUTS_DEMANDE.filter((s) => s.ouvert).map((s) => s.key);

// ── Priorités ────────────────────────────────────────────────────────────────
export type PrioriteDemande = "critique" | "elevee" | "normale" | "faible";
export const PRIORITES_DEMANDE: { key: PrioriteDemande; label: string; tone: string; ordre: number }[] = [
  { key: "critique", label: "Critique", tone: "var(--oxblood)", ordre: 0 },
  { key: "elevee",   label: "Élevée",   tone: "var(--warn)",    ordre: 1 },
  { key: "normale",  label: "Normale",  tone: "var(--accent)",  ordre: 2 },
  { key: "faible",   label: "Faible",   tone: "var(--faint)",   ordre: 3 },
];
export const prioriteDemandeDef = (k: string) => PRIORITES_DEMANDE.find((p) => p.key === k) || PRIORITES_DEMANDE[2];

// ── Types de demande (extensible) ────────────────────────────────────────────
export type TypeDemande = { key: string; label: string; icon: string; roleCible: string | null };
export const TYPES_DEMANDE: TypeDemande[] = [
  { key: "prestation",  label: "Demande de prestation", icon: "🤝", roleCible: "officier" },
  { key: "rh",          label: "Demande RH",            icon: "🧑‍💼", roleCible: "direction" },
  { key: "signalement", label: "Signalement",           icon: "🚩", roleCible: "officier" },
  { key: "operation",   label: "Opération",             icon: "🎯", roleCible: "officier" },
  { key: "facture",     label: "Facturation",           icon: "🧾", roleCible: "direction" },
  { key: "commande",    label: "Commande",              icon: "📦", roleCible: "armurier" },
  { key: "rdv",         label: "Rendez-vous",           icon: "📅", roleCible: null },
  { key: "autre",       label: "Autre demande",         icon: "📨", roleCible: null },
];
export const typeDemandeDef = (k: string) => TYPES_DEMANDE.find((t) => t.key === k) || TYPES_DEMANDE[TYPES_DEMANDE.length - 1];

// ── Types portés par la couche transport ────────────────────────────────────
export type DemandeMessage = { id: string; auteurId: string | null; auteurNom: string; corps: string; pieces: { nom: string; url: string }[]; createdAt: string; editedAt: string | null };
export type DemandeEvent = { id: string; type: string; par: string | null; details: Record<string, unknown> | null; at: string };
export type Demande = {
  id: string; ref: string; type: string; titre: string; resume: string | null;
  priorite: string; statut: string;
  auteurId: string | null; auteurNom: string; roleCible: string | null;
  assigneId: string | null; assigneNom: string | null; assigneAt: string | null;
  cibleId: string | null; lien: string | null;
  createdAt: string; updatedAt: string | null; closedAt: string | null;
};
export type DemandeDetail = Demande & { messages: DemandeMessage[]; evenements: DemandeEvent[] };
export type DemandesData = { pret: boolean; demandes: Demande[]; stats: { total: number; ouvertes: number; nonAssignees: number; miennes: number } };

// Numéro de repli si la fonction SQL n'est pas disponible (tolérant).
export function genererRefDemandeLocale(annee: number, alea: string): string {
  return `DEM-${annee}-${alea.slice(0, 6).toUpperCase()}`;
}

// Délai écoulé lisible (« il y a 2 h »).
export function depuis(iso: string | null): string {
  if (!iso) return "";
  try {
    const ms = Date.now() - new Date(iso).getTime();
    const m = Math.floor(ms / 60000);
    if (m < 1) return "à l'instant";
    if (m < 60) return `il y a ${m} min`;
    const h = Math.floor(m / 60);
    if (h < 24) return `il y a ${h} h`;
    const j = Math.floor(h / 24);
    return `il y a ${j} j`;
  } catch { return ""; }
}
