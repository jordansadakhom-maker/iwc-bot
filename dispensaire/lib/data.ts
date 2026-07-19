import { db, configured } from "./supabase";

export type Salarie = { id: string; nom: string; niveau: string | null; qualifications: string | null; telegramme: string | null; actif: boolean };
export type Service = { id: string; salarieNom: string; debut: string };
export type StockLigne = { id: string; nom: string; categorie: string; lieu: string | null; quantite: number; seuil: number; unite: string | null };

type Raw = Record<string, unknown>;
const s = (v: unknown) => (v == null ? null : String(v));

export async function getSalaries(): Promise<Salarie[]> {
  const sb = db(); if (!sb) return [];
  const { data } = await sb.from("DispSalarie").select("*").eq("actif", true).order("nom", { ascending: true });
  return ((data as Raw[]) || []).map((r) => ({ id: String(r.id), nom: String(r.nom || "—"), niveau: s(r.niveau), qualifications: s(r.qualifications), telegramme: s(r.telegramme), actif: r.actif !== false }));
}

export async function getServicesEnCours(): Promise<Service[]> {
  const sb = db(); if (!sb) return [];
  const { data } = await sb.from("DispPointage").select("id,salarieNom,debut,fin").is("fin", null).order("debut", { ascending: true });
  return ((data as Raw[]) || []).map((r) => ({ id: String(r.id), salarieNom: String(r.salarieNom || "—"), debut: String(r.debut) }));
}

export async function getStock(): Promise<StockLigne[]> {
  const sb = db(); if (!sb) return [];
  const { data } = await sb.from("DispStock").select("*").order("categorie", { ascending: true }).order("nom", { ascending: true });
  return ((data as Raw[]) || []).map((r) => ({ id: String(r.id), nom: String(r.nom || "—"), categorie: String(r.categorie || "Matière"), lieu: s(r.lieu), quantite: Number(r.quantite) || 0, seuil: Number(r.seuil) || 0, unite: s(r.unite) }));
}

export async function getStockAlerte(): Promise<StockLigne[]> {
  return (await getStock()).filter((x) => x.seuil > 0 && x.quantite <= x.seuil);
}

export const dbPrete = configured;
