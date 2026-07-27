import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { peutModifierStock } from "@/lib/dispensaire-roles";
import { parseIngredients, type FabricationData, type Recette, type MatiereRef, type ProduitRef } from "@/lib/dispensaire-fabrication-const";

export * from "@/lib/dispensaire-fabrication-const";

const str = (v: unknown) => (v == null ? null : String(v));
const num = (v: unknown) => Number(v) || 0;

function toRecette(r: Record<string, unknown>): Recette {
  return {
    id: String(r.id), nom: String(r.nom || "Recette"), produitNom: String(r.produitNom || ""),
    produitStockId: str(r.produitStockId), rendement: Math.max(1, num(r.rendement) || 1),
    ingredients: parseIngredients(r.ingredients), note: str(r.note),
    updatedAt: str(r.updatedAt), updatedBy: str(r.updatedBy),
  };
}

async function q<T>(p: PromiseLike<{ data: T | null }>): Promise<T | null> { try { return (await p).data; } catch { return null; } }

export async function getFabrication(): Promise<FabricationData> {
  const vide: FabricationData = { pret: false, canEdit: false, recettes: [], matieres: [], produits: [] };
  const admin = createAdminClient();
  if (!admin) return vide;
  const canEdit = await peutModifierStock();

  const { data, error } = await admin.from("DispensaireRecette").select("*").order("nom", { ascending: true });
  if (error) return { ...vide, pret: false, canEdit };   // table absente (SQL non lancé)
  const recettes = ((data || []) as Record<string, unknown>[]).map(toRecette);

  const [mat, stock] = await Promise.all([
    q<Record<string, unknown>[]>(admin.from("DispensaireMatiere").select("id,nom,quantite,unite").order("nom", { ascending: true })),
    q<Record<string, unknown>[]>(admin.from("DispensaireStock").select("id,nom,stock,unite").order("nom", { ascending: true })),
  ]);
  const matieres: MatiereRef[] = ((mat || []) as Record<string, unknown>[]).map((r) => ({ id: String(r.id), nom: String(r.nom || "?"), quantite: num(r.quantite), unite: str(r.unite) }));
  const produits: ProduitRef[] = ((stock || []) as Record<string, unknown>[]).map((r) => ({ id: String(r.id), nom: String(r.nom || "?"), stock: num(r.stock), unite: str(r.unite) }));

  return { pret: true, canEdit, recettes, matieres, produits };
}
