// Journal d'audit — types & helpers PURS (importables client + serveur, testables).

export type ActiviteItem = {
  id: string;
  module: string;
  action: string;
  cible: string | null;
  cibleId: string | null;
  par: string | null;
  at: string;
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

// Filtre par module (« tous » = pas de filtre) + recherche texte (action/cible/par).
export function filtrerActivite(items: ActiviteItem[], module: string, q: string): ActiviteItem[] {
  const t = (q || "").trim().toLowerCase();
  return items.filter((a) => {
    if (module && module !== "tous" && a.module !== module) return false;
    if (!t) return true;
    return [a.action, a.cible, a.par, a.module].some((v) => String(v || "").toLowerCase().includes(t));
  });
}

// Normalise une ligne brute de "ActivityLog" en ActiviteItem.
export function versActiviteItem(r: Record<string, unknown>): ActiviteItem {
  const s = (v: unknown): string | null => (v == null ? null : String(v));
  return {
    id: String(r.id),
    module: String(r.module || "activite"),
    action: String(r.action || ""),
    cible: s(r.cible),
    cibleId: s(r.cibleId),
    par: s(r.par),
    at: String(r.at || ""),
  };
}
