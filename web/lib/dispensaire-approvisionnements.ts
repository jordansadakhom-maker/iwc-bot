import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { estAutorise, peutModifierStock } from "@/lib/dispensaire-roles";
import { type ApprovisionnementsData, type ApproLigne, type Fournisseur, type ApproStatut } from "@/lib/dispensaire-approvisionnements-const";

export * from "@/lib/dispensaire-approvisionnements-const";

const s = (v: unknown) => (v == null ? null : String(v));
const num = (v: unknown) => Number(v) || 0;
async function q<T>(p: PromiseLike<{ data: T | null }>): Promise<T | null> { try { return (await p).data; } catch { return null; } }
const STATUTS: ApproStatut[] = ["a_commander", "urgente", "passee", "a_recuperer"];
const statutDe = (v: unknown): ApproStatut => { const t = String(v); return (STATUTS as string[]).includes(t) ? (t as ApproStatut) : "a_commander"; };

export async function getApprovisionnements(): Promise<ApprovisionnementsData> {
  const vide: ApprovisionnementsData = { connecte: false, pret: false, canEdit: false, lignes: [], fournisseurs: [] };
  const admin = createAdminClient();
  if (!admin) return vide;
  const [autorise, canEdit] = await Promise.all([estAutorise(), peutModifierStock()]);
  if (!autorise) return { ...vide, connecte: true };

  const [lignesRaw, fournisseursRaw] = await Promise.all([
    q<Record<string, unknown>[]>(admin.from("DispensaireApprovisionnement").select("*").order("article", { ascending: true })),
    q<Record<string, unknown>[]>(admin.from("DispensaireFournisseur").select("*").order("nom", { ascending: true })),
  ]);
  // Si les tables n'existent pas encore, les lectures renvoient null → pret=false
  // (l'écran invite à lancer le SQL) mais l'accès reste ouvert pour l'amorçage.
  const pret = lignesRaw != null || fournisseursRaw != null;

  const lignes: ApproLigne[] = ((lignesRaw || []) as Record<string, unknown>[]).map((r) => ({
    id: String(r.id), article: String(r.article || "Article"), categorie: String(r.categorie || "Autre"),
    fournisseur: s(r.fournisseur), stock: num(r.stock), seuil: num(r.seuil), unite: s(r.unite),
    datePrevue: s(r.datePrevue), statut: statutDe(r.statut), note: s(r.note),
    createdAt: String(r.createdAt || ""), updatedAt: s(r.updatedAt),
  }));
  const fournisseurs: Fournisseur[] = ((fournisseursRaw || []) as Record<string, unknown>[]).map((r) => ({
    id: String(r.id), nom: String(r.nom || "Fournisseur"), categorie: String(r.categorie || "Autre"),
    contact: s(r.contact), lieu: s(r.lieu), note: s(r.note),
    createdAt: String(r.createdAt || ""), updatedAt: s(r.updatedAt),
  }));

  return { connecte: true, pret, canEdit, lignes, fournisseurs };
}
