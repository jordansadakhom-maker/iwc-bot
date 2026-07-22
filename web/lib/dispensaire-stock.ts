import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { enAlerte, type StockData, type StockItem, type StockMouvement } from "@/lib/dispensaire-stock-const";

// Réexporte les constantes/types purs pour les consommateurs serveur.
export * from "@/lib/dispensaire-stock-const";

const s = (v: unknown) => (v == null ? null : String(v));
const num = (v: unknown) => Number(v) || 0;

function toItem(r: Record<string, unknown>): StockItem {
  return {
    id: String(r.id), nom: String(r.nom || "Article"), categorie: String(r.categorie || "materiel"),
    coffre: s(r.coffre), unite: s(r.unite), stock: num(r.stock), stockFixe: num(r.stockFixe), seuil: num(r.seuil),
    note: s(r.note), updatedAt: s(r.updatedAt), updatedBy: s(r.updatedBy),
  };
}

export async function getStock(): Promise<StockData> {
  const vide: StockData = { connecte: false, pret: false, canEdit: false, items: [], coffres: [], mouvements: [], alertes: 0 };
  const admin = createAdminClient();
  if (!admin) return vide;
  const canEdit = true; // outil de service partagé

  const { data, error } = await admin.from("DispensaireStock").select("*").order("nom", { ascending: true });
  if (error) return { ...vide, connecte: true, pret: false, canEdit };
  const items = ((data || []) as Record<string, unknown>[]).map(toItem);

  const coffres = [...new Set(items.map((i) => (i.coffre || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const alertes = items.filter(enAlerte).length;

  const { data: mvt } = await admin.from("DispensaireStockMouvement").select("*").order("createdAt", { ascending: false }).limit(60);
  const mouvements: StockMouvement[] = ((mvt || []) as Record<string, unknown>[]).map((r) => ({
    id: String(r.id), stockId: s(r.stockId), nomItem: String(r.nomItem || "?"), coffre: s(r.coffre),
    delta: num(r.delta), apres: r.apres == null ? null : num(r.apres), motif: s(r.motif), par: s(r.par), createdAt: String(r.createdAt),
  }));

  return { connecte: true, pret: true, canEdit, items, coffres, mouvements, alertes };
}

// Encart léger de l'accueil : articles en alerte (stock ≤ seuil).
export async function getAlertesStock(): Promise<{ pret: boolean; items: { nom: string; stock: number; seuil: number; unite: string | null; coffre: string | null }[] }> {
  const admin = createAdminClient();
  if (!admin) return { pret: false, items: [] };
  const { data, error } = await admin.from("DispensaireStock").select("nom,stock,seuil,unite,coffre");
  if (error) return { pret: false, items: [] };
  const items = ((data || []) as Record<string, unknown>[])
    .map((r) => ({ nom: String(r.nom || "Article"), stock: num(r.stock), seuil: num(r.seuil), unite: s(r.unite), coffre: s(r.coffre) }))
    .filter((i) => enAlerte(i))
    .sort((a, b) => a.stock - b.stock);
  return { pret: true, items };
}
