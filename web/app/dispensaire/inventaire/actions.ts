"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import type { StockMouvement } from "@/lib/dispensaire-stock-const";

// Inventaire global — LECTURE SEULE. Aucune écriture : cet écran ne fait que
// consulter le stock existant. Récupère l'historique des mouvements d'UN produit,
// c.-à-d. de toutes ses lignes (le même produit peut exister dans plusieurs coffres).
export async function getMouvementsProduit(stockIds: string[]): Promise<StockMouvement[]> {
  const admin = createAdminClient();
  if (!admin) return [];
  const ids = (stockIds || []).filter(Boolean).slice(0, 100);
  if (!ids.length) return [];
  const num = (v: unknown) => Number(v) || 0;
  const s = (v: unknown) => (v == null ? null : String(v));
  const { data } = await admin
    .from("DispensaireStockMouvement")
    .select("*")
    .in("stockId", ids)
    .order("createdAt", { ascending: false })
    .limit(60);
  return ((data || []) as Record<string, unknown>[]).map((r) => ({
    id: String(r.id), stockId: s(r.stockId), nomItem: String(r.nomItem || "?"), coffre: s(r.coffre),
    delta: num(r.delta), apres: r.apres == null ? null : num(r.apres), motif: s(r.motif), par: s(r.par), createdAt: String(r.createdAt),
  }));
}
