// Types & helpers PURS des approvisionnements (importables côté client — aucun
// accès serveur ici). Centralise les seuils de commande (stock vs seuil), la date
// prévue de commande, le statut de la commande et le carnet des fournisseurs
// (distillerie, tonnellerie, mine, menuisier, cheminots…).

export type ApproStatut = "a_commander" | "urgente" | "passee" | "a_recuperer";

export type ApproLigne = {
  id: string; article: string; categorie: string; fournisseur: string | null;
  stock: number; seuil: number; unite: string | null;
  datePrevue: string | null; statut: ApproStatut; note: string | null;
  createdAt: string; updatedAt: string | null;
};

export type Fournisseur = {
  id: string; nom: string; categorie: string;
  contact: string | null; lieu: string | null; note: string | null;
  createdAt: string; updatedAt: string | null;
};

export type ApprovisionnementsData = {
  connecte: boolean; pret: boolean; canEdit: boolean;
  lignes: ApproLigne[]; fournisseurs: Fournisseur[];
};

// Statuts de commande — l'indicateur demandé (à commander / urgente / déjà
// passée / à récupérer). `tone` = couleur d'affichage (variables du thème).
export const APPRO_STATUTS: { key: ApproStatut; label: string; tone: string }[] = [
  { key: "a_commander", label: "À commander", tone: "var(--accent)" },
  { key: "urgente", label: "Urgente", tone: "var(--oxblood)" },
  { key: "passee", label: "Déjà passée", tone: "var(--muted)" },
  { key: "a_recuperer", label: "À récupérer", tone: "var(--good)" },
];
export function approStatut(k: string): { key: ApproStatut; label: string; tone: string } {
  return APPRO_STATUTS.find((s) => s.key === k) || APPRO_STATUTS[0];
}

// Catégories de fournisseurs suggérées (l'utilisateur peut en saisir d'autres).
export const APPRO_CATEGORIES = ["Distillerie", "Tonnellerie", "Mine", "Menuisier", "Cheminots", "Forge", "Épicerie", "Écurie", "Autre"];

// Un article est sous son seuil si un seuil est défini et que le stock l'atteint.
export const sousLeSeuil = (l: { stock: number; seuil: number }) => l.seuil > 0 && l.stock <= l.seuil;

// Priorité d'affichage : les commandes à traiter d'abord remontent en tête.
const RANG: Record<ApproStatut, number> = { urgente: 0, a_recuperer: 1, a_commander: 2, passee: 3 };
export function trierLignes(lignes: ApproLigne[]): ApproLigne[] {
  return [...lignes].sort((a, b) => {
    const ra = RANG[a.statut] ?? 9, rb = RANG[b.statut] ?? 9;
    if (ra !== rb) return ra - rb;
    const sa = sousLeSeuil(a) ? 0 : 1, sb = sousLeSeuil(b) ? 0 : 1;
    if (sa !== sb) return sa - sb;
    return a.article.localeCompare(b.article);
  });
}
