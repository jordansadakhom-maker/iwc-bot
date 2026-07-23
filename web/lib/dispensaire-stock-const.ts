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
