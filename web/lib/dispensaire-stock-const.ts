// Constantes, types & helpers PURS du stockage — importables côté client
// (aucun accès serveur ici, contrairement à `dispensaire-stock.ts`).

export type StockItem = {
  id: string; nom: string; categorie: string; coffre: string | null; unite: string | null;
  stock: number; stockFixe: number; seuil: number; note: string | null; photo: string | null;
  updatedAt: string | null; updatedBy: string | null;
};
export type StockMouvement = { id: string; stockId: string | null; nomItem: string; coffre: string | null; delta: number; apres: number | null; motif: string | null; par: string | null; createdAt: string };
export type StockData = {
  connecte: boolean; pret: boolean; canEdit: boolean;
  items: StockItem[];
  coffres: string[];
  mouvements: StockMouvement[];
  alertes: number;
};

export const CATEGORIES = [
  { key: "medicament", label: "Médicaments" },
  { key: "materiel", label: "Matériel" },
  { key: "matiere", label: "Matières premières" },
  { key: "nourriture", label: "Nourriture" },
  { key: "autre", label: "Autre" },
];
export const catLabel = (k: string) => CATEGORIES.find((c) => c.key === k)?.label || "Autre";
export const enAlerte = (it: { stock: number; seuil: number }) => it.seuil > 0 && it.stock <= it.seuil;

// Indicateur 🟢🟠🔴 d'un objet : rouge = épuisé ou sous le seuil, orange = proche
// du seuil (≤ 2× seuil), vert = confortable.
export type Niveau = "rouge" | "orange" | "vert";
export function niveauStock(it: { stock: number; seuil: number }): Niveau {
  if (it.stock <= 0) return "rouge";
  if (it.seuil > 0) {
    if (it.stock <= it.seuil) return "rouge";
    if (it.stock <= it.seuil * 2) return "orange";
  }
  return "vert";
}
export const NIVEAU_TON: Record<Niveau, string> = { rouge: "var(--oxblood)", orange: "var(--warn)", vert: "var(--good)" };
export const NIVEAU_PASTILLE: Record<Niveau, string> = { rouge: "🔴", orange: "🟠", vert: "🟢" };

// ── Coffres = vrais inventaires ──────────────────────────────────────────────
// Un coffre regroupe les objets (DispensaireStock) qui pointent sur son nom.
export const NON_RANGE = "";
export type CoffreInv = {
  id: string | null;              // id d'entité si le coffre est déclaré, sinon null (dérivé d'un nom)
  nom: string;                    // "" = objets non rangés
  emplacement: string | null;
  responsable: string | null;
  note: string | null;
  photo: string | null;
  items: StockItem[];
  nbObjets: number;               // nombre d'objets distincts
  totalUnites: number;            // somme des quantités
  alertes: number;                // objets sous le seuil
};
export type CoffresInvData = {
  connecte: boolean; pret: boolean; canEdit: boolean;
  coffres: CoffreInv[];
  categories: string[];
};
