import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { enAlerte, type StockData, type StockItem, type StockMouvement, type CoffreInv, type CoffresInvData } from "@/lib/dispensaire-stock-const";

// Réexporte les constantes/types purs pour les consommateurs serveur.
export * from "@/lib/dispensaire-stock-const";

const s = (v: unknown) => (v == null ? null : String(v));
const num = (v: unknown) => Number(v) || 0;

function toItem(r: Record<string, unknown>): StockItem {
  return {
    id: String(r.id), nom: String(r.nom || "Article"), categorie: String(r.categorie || "materiel"),
    coffre: s(r.coffre), unite: s(r.unite), stock: num(r.stock), stockFixe: num(r.stockFixe), seuil: num(r.seuil),
    note: s(r.note), photo: s(r.photo), updatedAt: s(r.updatedAt), updatedBy: s(r.updatedBy),
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

  // Coffres proposés : ceux déjà utilisés par un article + les coffres déclarés comme entités.
  let entites: string[] = [];
  try {
    const { data: cf } = await admin.from("DispensaireCoffre").select("nom");
    entites = ((cf || []) as Record<string, unknown>[]).map((r) => String(r.nom || "").trim()).filter(Boolean);
  } catch { /* table Coffres pas encore créée */ }
  const coffres = [...new Set([...items.map((i) => (i.coffre || "").trim()).filter(Boolean), ...entites])].sort((a, b) => a.localeCompare(b));
  const alertes = items.filter(enAlerte).length;

  const { data: mvt } = await admin.from("DispensaireStockMouvement").select("*").order("createdAt", { ascending: false }).limit(60);
  const mouvements: StockMouvement[] = ((mvt || []) as Record<string, unknown>[]).map((r) => ({
    id: String(r.id), stockId: s(r.stockId), nomItem: String(r.nomItem || "?"), coffre: s(r.coffre),
    delta: num(r.delta), apres: r.apres == null ? null : num(r.apres), motif: s(r.motif), par: s(r.par), createdAt: String(r.createdAt),
  }));

  return { connecte: true, pret: true, canEdit, items, coffres, mouvements, alertes };
}

// Coffres vus comme de VRAIS inventaires : chaque coffre porte ses objets
// (articles DispensaireStock qui pointent sur son nom), avec ses totaux et ses
// alertes. Les coffres déclarés (entités) viennent en premier ; les noms de
// coffre utilisés sans être déclarés sont ajoutés en « dérivés » ; les objets
// sans coffre forment le groupe « Non rangé » en dernier.
export async function getCoffresInventaire(): Promise<CoffresInvData> {
  const vide: CoffresInvData = { connecte: false, pret: false, coffres: [], categories: [] };
  const admin = createAdminClient();
  if (!admin) return vide;

  const { data, error } = await admin.from("DispensaireStock").select("*").order("nom", { ascending: true });
  if (error) return { ...vide, connecte: true, pret: false };
  const items = ((data || []) as Record<string, unknown>[]).map(toItem);

  // Coffres déclarés (métadonnées : emplacement, responsable, photo…).
  type Meta = { id: string; nom: string; emplacement: string | null; responsable: string | null; note: string | null; photo: string | null };
  let entites: Meta[] = [];
  try {
    const { data: cf } = await admin.from("DispensaireCoffre").select("*").order("nom", { ascending: true });
    entites = ((cf || []) as Record<string, unknown>[]).map((r) => ({ id: String(r.id), nom: String(r.nom || "Coffre").trim(), emplacement: s(r.emplacement), responsable: s(r.responsable), note: s(r.note), photo: s(r.photo) }));
  } catch { /* table Coffres pas encore créée */ }

  // Regroupe les objets par nom de coffre.
  const parCoffre = new Map<string, StockItem[]>();
  for (const it of items) { const k = (it.coffre || "").trim(); (parCoffre.get(k) || parCoffre.set(k, []).get(k))!.push(it); }

  const build = (nom: string, meta?: Meta): CoffreInv => {
    const its = parCoffre.get(nom) || [];
    return {
      id: meta?.id ?? null, nom,
      emplacement: meta?.emplacement ?? null, responsable: meta?.responsable ?? null, note: meta?.note ?? null, photo: meta?.photo ?? null,
      items: its, nbObjets: its.length, totalUnites: its.reduce((a, b) => a + (b.stock || 0), 0), alertes: its.filter(enAlerte).length,
    };
  };

  const nomsEntites = new Set(entites.map((e) => e.nom));
  const coffres: CoffreInv[] = [];
  for (const e of entites) coffres.push(build(e.nom, e)); // déclarés (ordre alpha déjà)
  const derives = [...parCoffre.keys()].filter((k) => k && !nomsEntites.has(k)).sort((a, b) => a.localeCompare(b));
  for (const nom of derives) coffres.push(build(nom)); // dérivés (nom utilisé, non déclaré)
  const nonRanges = parCoffre.get("") || [];
  if (nonRanges.length) coffres.push(build("")); // « Non rangé » en dernier, si non vide

  const categories = [...new Set(items.map((i) => i.categorie))];
  return { connecte: true, pret: true, coffres, categories };
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
