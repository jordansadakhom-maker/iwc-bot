// Centre de notifications — types & helpers PURS (aucun accès serveur ici, donc
// importables côté client ET serveur, et testables unitairement).
//
// Le site est la plateforme unique : chaque événement important devient une
// ligne "Notification" persistante, avec une icône, un libellé, une tonalité et
// un lien profond vers la page concernée.

export type CentreNotif = {
  id: string;
  type: string;
  titre: string;
  corps: string | null;
  lien: string | null;
  clientNom: string | null;
  cibleId: string | null;
  lu: boolean;
  luAt: string | null;
  archive: boolean;
  supprime: boolean;
  createdAt: string;
};

// Métadonnées d'affichage par type d'événement.
export type NotifMeta = { icon: string; label: string; tone: "accent" | "good" | "warn" | "muted" | "oxblood" };

const META: Record<string, NotifMeta> = {
  telegramme: { icon: "✉️", label: "Télégramme", tone: "warn" },
  "telegramme-clos": { icon: "📁", label: "Télégramme clôturé", tone: "muted" },
  message: { icon: "💬", label: "Nouvelle réponse", tone: "accent" },
  rdv: { icon: "📅", label: "Rendez-vous", tone: "accent" },
  "rdv-statut": { icon: "🗓️", label: "Statut de RDV", tone: "good" },
  contrat: { icon: "📜", label: "Contrat", tone: "accent" },
  "contrat-statut": { icon: "⚖️", label: "Statut de contrat", tone: "good" },
  operation: { icon: "🎯", label: "Opération", tone: "oxblood" },
  "operation-statut": { icon: "🔄", label: "Phase d'opération", tone: "good" },
  candidature: { icon: "🐺", label: "Candidature", tone: "accent" },
  "candidature-statut": { icon: "✅", label: "Décision de candidature", tone: "good" },
  demande: { icon: "📨", label: "Nouvelle demande", tone: "accent" },
  "demande-statut": { icon: "🔁", label: "Statut de demande", tone: "good" },
  "demande-transfert": { icon: "📨", label: "Demande transférée", tone: "warn" },
  tache: { icon: "📋", label: "Tâche", tone: "accent" },
  membre: { icon: "👤", label: "Ressources humaines", tone: "warn" },
};
const META_DEFAUT: NotifMeta = { icon: "🔔", label: "Notification", tone: "muted" };

export function notifMeta(type: string): NotifMeta {
  return META[type] || META_DEFAUT;
}

// ── Priorités (dérivées du type) ─────────────────────────────────────────────
// Chaque notification porte un niveau de priorité, avec un affichage propre et
// un ordre de tri. Dérivé du type (aucune colonne SQL requise).
export type PrioriteNotif = "critique" | "elevee" | "normale" | "faible";
export const PRIORITE_META: Record<PrioriteNotif, { label: string; tone: string; ordre: number }> = {
  critique: { label: "Critique", tone: "var(--oxblood)", ordre: 0 },
  elevee: { label: "Élevée", tone: "var(--warn)", ordre: 1 },
  normale: { label: "Normale", tone: "var(--accent)", ordre: 2 },
  faible: { label: "Faible", tone: "var(--faint)", ordre: 3 },
};
const PRIORITE_TYPE: Record<string, PrioriteNotif> = {
  operation: "elevee", contrat: "elevee",
  membre: "elevee",                 // habilitation/accès sensible (RH)
  "demande-transfert": "elevee",    // un dossier attend une prise en charge
  "telegramme-clos": "faible", "rdv-statut": "faible",
};
export function prioriteDe(type: string): PrioriteNotif {
  return PRIORITE_TYPE[type] || "normale";
}

// ── Modules (dérivés du type) — pour le filtrage par domaine ─────────────────
export function moduleDe(type: string): string {
  if (type.startsWith("operation")) return "operations";
  if (type.startsWith("contrat")) return "contrats";
  if (type.startsWith("rdv")) return "rdv";
  if (type.startsWith("telegramme")) return "telegrammes";
  if (type === "message") return "messages";
  if (type.startsWith("candidature")) return "recrutement";
  if (type.startsWith("demande")) return "demandes";
  if (type === "tache") return "taches";
  if (type === "membre") return "rh";
  return "autre";
}

// ── Filtres du centre ────────────────────────────────────────────────────────
export const NOTIF_FILTRES = [
  { key: "tous", label: "Tous" },
  { key: "non_lus", label: "Non lus" },
  { key: "favoris", label: "★ Favoris" },
  { key: "operations", label: "Opérations" },
  { key: "contrats", label: "Contrats" },
  { key: "rdv", label: "Rendez-vous" },
  { key: "telegrammes", label: "Télégrammes" },
  { key: "messages", label: "Messages" },
  { key: "demandes", label: "Demandes" },
  { key: "taches", label: "Tâches" },
  { key: "recrutement", label: "Recrutement" },
  { key: "archive", label: "Archivés" },
  { key: "corbeille", label: "🗑 Corbeille" },
] as const;
export type NotifFiltre = (typeof NOTIF_FILTRES)[number]["key"];

// Une notification correspond-elle au filtre choisi ? Les archivées ne
// ressortent QUE dans l'onglet « Archivés ». `favoris` est fourni séparément
// (état par appareil) et géré dans le composant.
export function correspondFiltre(n: CentreNotif, filtre: string): boolean {
  if (filtre === "corbeille") return n.supprime;          // la corbeille montre UNIQUEMENT les supprimées
  if (n.supprime) return false;                            // partout ailleurs, on masque les supprimées
  switch (filtre) {
    case "non_lus": return !n.lu && !n.archive;
    case "operations": return !n.archive && n.type.startsWith("operation");
    case "contrats": return !n.archive && n.type.startsWith("contrat");
    case "rdv": return !n.archive && n.type.startsWith("rdv");
    case "telegrammes": return !n.archive && n.type.startsWith("telegramme");
    case "messages": return !n.archive && n.type === "message";
    case "demandes": return !n.archive && n.type.startsWith("demande");
    case "taches": return !n.archive && n.type === "tache";
    case "recrutement": return !n.archive && (n.type.startsWith("candidature") || n.type === "membre");
    case "archive": return n.archive;
    case "favoris": return !n.archive; // le tri favori est appliqué dans le composant
    default: return !n.archive; // « tous » = tout sauf archivé
  }
}

// Compteur des non-lues actives (hors archives) — pour la pastille rouge.
export const compteNonLus = (list: CentreNotif[]): number => list.filter((n) => !n.lu && !n.archive && !n.supprime).length;

// Normalise une ligne brute de la table "Notification" en CentreNotif.
export function versCentreNotif(r: Record<string, unknown>): CentreNotif {
  const s = (v: unknown): string | null => (v == null ? null : String(v));
  return {
    id: String(r.id),
    type: String(r.type || "notification"),
    titre: String(r.titre || "Notification"),
    corps: s(r.corps),
    lien: s(r.lien),
    clientNom: s(r.clientNom),
    cibleId: s(r.cibleId),
    lu: !!r.lu,
    luAt: s(r.luAt),
    archive: !!r.archive,
    supprime: !!r.supprime,
    createdAt: String(r.createdAt || ""),
  };
}

// Deep-link vers l'ÉLÉMENT précis à partir du type + cibleId : la notification
// ouvre directement le bon élément (modal), pas seulement la page. Repli sur le
// lien de page si aucun cibleId. Télégrammes/RDV/messages ont déjà leur route.
export function lienNotif(n: { type: string; lien: string | null; cibleId?: string | null }): string {
  const base = n.lien || "";
  const id = n.cibleId;
  if (!id) return base;
  if (n.type.startsWith("operation")) return `/operations?op=${encodeURIComponent(id)}`;
  if (n.type.startsWith("contrat")) return `/operations?ct=${encodeURIComponent(id)}`;
  if (n.type.startsWith("candidature")) return `/recrutement?focus=${encodeURIComponent(id)}`;
  return base;
}
