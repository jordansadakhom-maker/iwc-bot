// Types & constantes de la fabrication — importables CÔTÉ CLIENT (pas de
// dépendance serveur). La logique de lecture vit dans dispensaire-fabrication.ts.

export type Ingredient = { matiereId: string; nom: string; quantite: number };

export type Recette = {
  id: string; nom: string; produitNom: string; produitStockId: string | null;
  rendement: number; ingredients: Ingredient[]; note: string | null;
  updatedAt: string | null; updatedBy: string | null;
};

export type MatiereRef = { id: string; nom: string; quantite: number; unite: string | null };
export type ProduitRef = { id: string; nom: string; stock: number; unite: string | null };

export type FabricationData = {
  pret: boolean; canEdit: boolean;
  recettes: Recette[]; matieres: MatiereRef[]; produits: ProduitRef[];
};

// Parse défensif des ingrédients (JSONB → tableau typé).
export function parseIngredients(v: unknown): Ingredient[] {
  let arr: unknown = v;
  if (typeof v === "string") { try { arr = JSON.parse(v); } catch { arr = []; } }
  if (!Array.isArray(arr)) return [];
  return arr
    .map((x) => {
      const o = (x || {}) as Record<string, unknown>;
      return { matiereId: String(o.matiereId ?? ""), nom: String(o.nom ?? ""), quantite: Math.max(0, Math.round(Number(o.quantite) || 0)) };
    })
    .filter((i) => i.matiereId && i.quantite > 0);
}
