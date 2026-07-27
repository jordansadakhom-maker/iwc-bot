// Conversations (messagerie interne) — types & helpers PURS
// (importables client + serveur, testables sans I/O).

export type Conversation = {
  id: string; sujet: string; pole: string | null; statut: string;
  creePar: string | null; creeParId: string | null;
  lastMessageAt: string; lastApercu: string | null; lastAuteur: string | null;
  createdAt: string;
};

export type Message = {
  id: string; conversationId: string;
  auteurId: string | null; auteurNom: string | null;
  corps: string; createdAt: string;
};

// Conversation enrichie côté liste avec l'état de lecture du membre courant.
export type ConversationListe = Conversation & { nonLu: boolean };

export const STATUTS_CONVERSATION = [
  { key: "ouverte", label: "Ouverte" },
  { key: "archivee", label: "Archivée" },
] as const;

export const estArchivee = (c: Conversation) => c.statut === "archivee";

// Aperçu compact d'un corps de message (liste + notifications).
export function apercu(corps: string, n = 140): string {
  const t = String(corps ?? "").replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n - 1).trimEnd() + "…" : t;
}

// Non-lu = dernier message postérieur à la dernière vue du membre.
export function estNonLu(c: Conversation, vueAt: string | null): boolean {
  if (!vueAt) return true;
  const last = new Date(c.lastMessageAt).getTime();
  const vue = new Date(vueAt).getTime();
  if (!Number.isFinite(last) || !Number.isFinite(vue)) return false;
  return last > vue;
}

// Fils actifs d'abord (archivés en bas), puis les plus récemment animés en tête.
export function comparerConversations(a: Conversation, b: Conversation): number {
  const aa = estArchivee(a), ab = estArchivee(b);
  if (aa !== ab) return aa ? 1 : -1;
  const ta = new Date(a.lastMessageAt).getTime() || 0;
  const tb = new Date(b.lastMessageAt).getTime() || 0;
  return tb - ta;
}

export function trierConversations<T extends Conversation>(list: T[]): T[] {
  return [...list].sort(comparerConversations);
}

export function versConversation(r: Record<string, unknown>): Conversation {
  const s = (v: unknown): string | null => (v == null ? null : String(v));
  return {
    id: String(r.id), sujet: String(r.sujet || ""), pole: s(r.pole),
    statut: String(r.statut || "ouverte"), creePar: s(r.creePar), creeParId: s(r.creeParId),
    lastMessageAt: String(r.lastMessageAt || r.createdAt || ""), lastApercu: s(r.lastApercu),
    lastAuteur: s(r.lastAuteur), createdAt: String(r.createdAt || ""),
  };
}

export function versMessage(r: Record<string, unknown>): Message {
  const s = (v: unknown): string | null => (v == null ? null : String(v));
  return {
    id: String(r.id), conversationId: String(r.conversationId || ""),
    auteurId: s(r.auteurId), auteurNom: s(r.auteurNom),
    corps: String(r.corps || ""), createdAt: String(r.createdAt || ""),
  };
}
