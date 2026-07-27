// Assistant / moteur de veille — types & helpers PURS (importables côté client).
// Un « constat » = quelque chose que le système a détecté dans les VRAIES données
// et qui mérite ton attention, avec une action suggérée. Aucune donnée inventée :
// chaque constat est dérivé de l'existant (stocks, pointages, contrats, coffres…).

export type Gravite = "critique" | "important" | "info";

// Priorité fine (6 niveaux) — porte le rang réel de chaque constat. La gravité
// (3 bandes) en est dérivée pour l'affichage groupé.
export type Priorite = "information" | "faible" | "normale" | "importante" | "urgente" | "critique";
export const PRIORITE_ORDRE: Record<Priorite, number> = { critique: 0, urgente: 1, importante: 2, normale: 3, faible: 4, information: 5 };
export const PRIORITE_LABEL: Record<Priorite, string> = { critique: "Critique", urgente: "Urgente", importante: "Importante", normale: "Normale", faible: "Faible", information: "Information" };
export const PRIORITE_TON: Record<Priorite, string> = { critique: "var(--oxblood)", urgente: "var(--oxblood)", importante: "var(--warn)", normale: "var(--accent)", faible: "var(--steel)", information: "var(--muted)" };
export function graviteDe(p: Priorite): Gravite { if (p === "critique" || p === "urgente") return "critique"; if (p === "importante" || p === "normale") return "important"; return "info"; }

// État du cycle de vie d'une notification (couche persistée par-dessus le constat).
export type Etat = "nouveau" | "en_cours" | "resolu" | "archive";
export const ETATS: Etat[] = ["nouveau", "en_cours", "resolu", "archive"];
export const ETAT_LABEL: Record<Etat, string> = { nouveau: "Non lue", en_cours: "En cours", resolu: "Résolue", archive: "Archivée" };
export const ETAT_TON: Record<Etat, string> = { nouveau: "var(--accent)", en_cours: "var(--warn)", resolu: "var(--good)", archive: "var(--muted)" };
export const ETAT_ACTIFS: Etat[] = ["nouveau", "en_cours"]; // affichés par défaut
// Escalade : un point critique/urgent encore « Non lu » remonte de lui-même.
export function estEscalade(c: { priorite: Priorite; etat?: Etat }): boolean {
  return (c.etat ?? "nouveau") === "nouveau" && (c.priorite === "critique" || c.priorite === "urgente");
}

export type Constat = {
  id: string;
  gravite: Gravite;
  priorite: Priorite;
  categorie: string;     // Stock · Coffre · RH · Contrats · Impôts…
  titre: string;         // constat court
  detail: string | null; // précision chiffrée
  suggestion: string;    // action proposée (jamais exécutée sans toi)
  href: string;          // lien direct vers l'élément concerné
  etat?: Etat;           // couche persistée (défaut « nouveau »)
  action?: { kind: string; label: string; ref?: string }; // action INLINE exécutable en 1 clic (facultative ; ref = cible)
};

// Résultat d'une action de constat exécutée en 1 clic depuis l'assistant.
export type ActionConstatResult = { ok: boolean; error?: string; message?: string };

export type AssistantData = {
  pret: boolean;
  constats: Constat[];
  parGravite: { critique: number; important: number; info: number };
  genereLe: string;      // horodatage formaté côté serveur (évite tout décalage d'hydratation)
};

export const GRAVITE_ORDRE: Record<Gravite, number> = { critique: 0, important: 1, info: 2 };
export const GRAVITE_TON: Record<Gravite, string> = { critique: "var(--oxblood)", important: "var(--warn)", info: "var(--accent)" };
export const GRAVITE_LABEL: Record<Gravite, string> = { critique: "Critique", important: "À traiter", info: "Information" };

export const trierConstats = (cs: Constat[]) => [...cs].sort((a, b) => GRAVITE_ORDRE[a.gravite] - GRAVITE_ORDRE[b.gravite]);

// Compteurs par gravité.
export function compterGravite(cs: Constat[]): AssistantData["parGravite"] {
  return { critique: cs.filter((c) => c.gravite === "critique").length, important: cs.filter((c) => c.gravite === "important").length, info: cs.filter((c) => c.gravite === "info").length };
}

// Constats dérivés du socle ERP récent (tâches, conversations — modules Phase 4).
// PUR & testable : la lecture réelle est faite par l'appelant (assistant-iwc).
export function constatsSocle(
  input: {
    taches?: { statut: string; echeance: string | null; assigneId: string | null }[];
    conversations?: { statut: string; lastMessageAt: string }[];
  },
  now: number = Date.now(),
): Constat[] {
  const g = (c: Omit<Constat, "gravite">): Constat => ({ ...c, gravite: graviteDe(c.priorite) });
  const out: Constat[] = [];
  const taches = input.taches ?? [];
  const conversations = input.conversations ?? [];
  const parse = (v: string | null) => { const t = Date.parse(String(v ?? "")); return Number.isFinite(t) ? t : null; };

  const enRetard = taches.filter((t) => { const e = parse(t.echeance); return t.statut !== "faite" && e != null && e < now; }).length;
  if (enRetard) out.push(g({ id: "taches-retard", priorite: "importante", categorie: "Tâches", titre: `${enRetard} tâche(s) en retard`, detail: null, suggestion: "Traite ou replanifie les tâches dont l'échéance est passée.", href: "/taches" }));

  const nonAssignees = taches.filter((t) => t.statut !== "faite" && !t.assigneId).length;
  if (nonAssignees) out.push(g({ id: "taches-non-assignees", priorite: "normale", categorie: "Tâches", titre: `${nonAssignees} tâche(s) non assignée(s)`, detail: null, suggestion: "Assigne-les via l'attribution assistée.", href: "/taches" }));

  const SEUIL = 7 * 86400000;
  const inactives = conversations.filter((c) => { const t = parse(c.lastMessageAt); return c.statut !== "archivee" && t != null && now - t > SEUIL; }).length;
  if (inactives) out.push(g({ id: "conv-inactives", priorite: "information", categorie: "Messagerie", titre: `${inactives} conversation(s) sans activité depuis 7 j`, detail: null, suggestion: "Relance le fil ou archive-le pour garder la messagerie claire.", href: "/messages" }));

  return out;
}

// Rapport auto d'une phrase — le « résumé du jour ».
export function resumeAuto(cs: Constat[]): string {
  if (!cs.length) return "Rien à signaler — tout est à jour.";
  const g = compterGravite(cs);
  const bouts: string[] = [];
  if (g.critique) bouts.push(`${g.critique} point${g.critique > 1 ? "s" : ""} critique${g.critique > 1 ? "s" : ""}`);
  if (g.important) bouts.push(`${g.important} à traiter`);
  if (g.info) bouts.push(`${g.info} info${g.info > 1 ? "s" : ""}`);
  const tete = trierConstats(cs)[0];
  return `${bouts.join(" · ")} — en priorité : ${tete.titre}.`;
}
