// Journal d'audit — types & helpers PURS (importables client + serveur, testables).

export type ActiviteItem = {
  id: string;
  module: string;
  action: string;
  cible: string | null;
  cibleId: string | null;
  par: string | null;
  at: string;
  // Enrichissements (présents une fois activite-avant-apres.sql lancé) :
  parId?: string | null;
  avant?: unknown;
  apres?: unknown;
  payload?: Record<string, unknown> | null;
};

export type ActiviteMeta = { icon: string; label: string };

const MODULE_META: Record<string, ActiviteMeta> = {
  operation: { icon: "🎯", label: "Opérations" },
  contrat: { icon: "📜", label: "Contrats" },
  coffre: { icon: "💰", label: "Coffre" },
  wallet: { icon: "👛", label: "Portefeuilles" },
  rapportinfo: { icon: "🕵️", label: "Renseignement" },
  traque: { icon: "🎯", label: "Traques" },
  contact: { icon: "📇", label: "Contacts" },
  dossiermedical: { icon: "🩺", label: "Médical" },
  facture: { icon: "🧾", label: "Factures" },
  membre: { icon: "👤", label: "Membres" },
  candidature: { icon: "🐺", label: "Recrutement" },
  rdv: { icon: "📅", label: "Rendez-vous" },
  telegramme: { icon: "✉️", label: "Télégrammes" },
};
const DEFAUT: ActiviteMeta = { icon: "•", label: "Activité" };

export function activiteMeta(module: string): ActiviteMeta {
  return MODULE_META[String(module || "").toLowerCase()] || { ...DEFAUT, label: module || DEFAUT.label };
}

// Liste triée des modules présents (pour les filtres).
export function modulesDe(items: ActiviteItem[]): string[] {
  return [...new Set(items.map((a) => a.module).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

// Filtre par module (« tous » = pas de filtre) + recherche texte (action/cible/par)
// + plage de dates optionnelle (bornes ISO « yyyy-mm-dd », incluses).
export function filtrerActivite(items: ActiviteItem[], module: string, q: string, dateDebut = "", dateFin = ""): ActiviteItem[] {
  const t = (q || "").trim().toLowerCase();
  const min = dateDebut ? new Date(dateDebut + "T00:00:00").getTime() : null;
  const max = dateFin ? new Date(dateFin + "T23:59:59").getTime() : null;
  return items.filter((a) => {
    if (module && module !== "tous" && a.module !== module) return false;
    if (min !== null || max !== null) {
      const ts = new Date(a.at).getTime();
      if (min !== null && ts < min) return false;
      if (max !== null && ts > max) return false;
    }
    if (!t) return true;
    return [a.action, a.cible, a.par, a.module].some((v) => String(v || "").toLowerCase().includes(t));
  });
}

// Motif humain d'une entrée (raison saisie), extrait du payload s'il existe.
export function motifDe(item: ActiviteItem): string | null {
  const p = item.payload;
  if (!p || typeof p !== "object") return null;
  const v = (p as Record<string, unknown>).motif ?? (p as Record<string, unknown>).raison;
  const t = v == null ? "" : String(v).trim();
  return t || null;
}

// Différences avant→après lisibles (champs modifiés uniquement). Retourne [] si
// l'un des deux côtés n'est pas un objet (rien de comparable).
export type DiffLigne = { champ: string; de: string; vers: string };
export function diffAvantApres(item: ActiviteItem): DiffLigne[] {
  const av = item.avant, ap = item.apres;
  if (!av || !ap || typeof av !== "object" || typeof ap !== "object") return [];
  const a = av as Record<string, unknown>, b = ap as Record<string, unknown>;
  const champs = [...new Set([...Object.keys(a), ...Object.keys(b)])];
  const fmt = (v: unknown) => { if (v == null || v === "") return "—"; if (typeof v === "object") return JSON.stringify(v); return String(v); };
  const out: DiffLigne[] = [];
  for (const c of champs) {
    const de = fmt(a[c]), vers = fmt(b[c]);
    if (de !== vers) out.push({ champ: c, de, vers });
  }
  return out;
}

// Export CSV du journal (échappement RFC 4180 minimal).
export function activiteCSV(items: ActiviteItem[]): string {
  const esc = (v: unknown) => { const t = String(v ?? ""); return /[",\n;]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
  const lignes = [["Date", "Module", "Action", "Cible", "Auteur", "Motif"].join(";")];
  for (const a of items) {
    lignes.push([esc(a.at), esc(activiteMeta(a.module).label), esc(a.action), esc(a.cible), esc(a.par || "Système"), esc(motifDe(a) || "")].join(";"));
  }
  return lignes.join("\n");
}

// Normalise une ligne brute de "ActivityLog" en ActiviteItem. Les champs
// enrichis ne sont ajoutés QUE s'ils existent (tolérant : SQL non lancé →
// colonnes absentes → objet minimal, inchangé).
export function versActiviteItem(r: Record<string, unknown>): ActiviteItem {
  const s = (v: unknown): string | null => (v == null ? null : String(v));
  const item: ActiviteItem = {
    id: String(r.id),
    module: String(r.module || "activite"),
    action: String(r.action || ""),
    cible: s(r.cible),
    cibleId: s(r.cibleId),
    par: s(r.par),
    at: String(r.at || ""),
  };
  if (r.parId != null) item.parId = String(r.parId);
  if (r.avant !== undefined) item.avant = r.avant ?? null;
  if (r.apres !== undefined) item.apres = r.apres ?? null;
  if (r.payload !== undefined) item.payload = (r.payload as Record<string, unknown>) ?? null;
  return item;
}
