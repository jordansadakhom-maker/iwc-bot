import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

// ── Historique global (chronologie dérivée de tous les modules) ──────────────
// Note : chaque module horodate ses écritures ; on les rassemble ici en un seul
// fil filtrable. Le Stockage porte le détail avant→après (mouvements tracés).
export type HistoItem = { id: string; module: string; action: string; cible: string; detail: string | null; par: string | null; at: string };
export type HistoData = { pret: boolean; items: HistoItem[]; modules: string[] };

const num = (v: unknown) => Number(v) || 0;
const str = (v: unknown) => (v == null ? null : String(v));
async function q<T>(p: PromiseLike<{ data: T | null }>): Promise<T | null> { try { return (await p).data; } catch { return null; } }
const L = 20;

export async function getHistorique(): Promise<HistoData> {
  const admin = createAdminClient();
  if (!admin) return { pret: false, items: [], modules: [] };

  const [mvts, ventes, point, frais, factures, certs, rapports, docs, salaries, matieres, fdo] = await Promise.all([
    q<Record<string, unknown>[]>(admin.from("DispensaireStockMouvement").select("id,nomItem,delta,apres,motif,par,createdAt").order("createdAt", { ascending: false }).limit(L)),
    q<Record<string, unknown>[]>(admin.from("DispensaireVente").select("id,patient,quantite,item,total,par,createdAt").order("createdAt", { ascending: false }).limit(L)),
    q<Record<string, unknown>[]>(admin.from("DispensairePointage").select("id,nom,dureeMin,fin").not("fin", "is", null).order("fin", { ascending: false }).limit(L)),
    q<Record<string, unknown>[]>(admin.from("DispensaireFrais").select("id,objet,montant,statut,par,updatedAt").order("updatedAt", { ascending: false }).limit(L)),
    q<Record<string, unknown>[]>(admin.from("DispensaireFacture").select("id,objet,montant,statut,par,updatedAt").order("updatedAt", { ascending: false }).limit(L)),
    q<Record<string, unknown>[]>(admin.from("DispensaireCertificat").select("id,patient,type,par,createdAt").order("createdAt", { ascending: false }).limit(L)),
    q<Record<string, unknown>[]>(admin.from("DispensaireRapport").select("id,titre,par,createdAt").order("createdAt", { ascending: false }).limit(L)),
    q<Record<string, unknown>[]>(admin.from("DispensaireDocument").select("id,titre,par,createdAt").order("createdAt", { ascending: false }).limit(L)),
    q<Record<string, unknown>[]>(admin.from("DispensaireSalarie").select("id,nom,statut,updatedBy,updatedAt").order("updatedAt", { ascending: false }).limit(L)),
    q<Record<string, unknown>[]>(admin.from("DispensaireMatiere").select("id,nom,quantite,updatedBy,updatedAt").order("updatedAt", { ascending: false }).limit(L)),
    q<Record<string, unknown>[]>(admin.from("DispensaireSoinFDO").select("id,bureau,agent,montant,par,createdAt").order("createdAt", { ascending: false }).limit(L)),
  ]);

  const pret = mvts !== null || ventes !== null || point !== null;
  const items: HistoItem[] = [];
  for (const r of mvts || []) items.push({ id: "m" + r.id, module: "Stockage", action: num(r.delta) >= 0 ? "Entrée" : "Sortie", cible: String(r.nomItem), detail: `${num(r.delta) >= 0 ? "+" : ""}${num(r.delta)} → ${num(r.apres)}${r.motif ? " · " + r.motif : ""}`, par: str(r.par), at: String(r.createdAt) });
  for (const r of ventes || []) items.push({ id: "v" + r.id, module: "Ventes", action: "Vente", cible: String(r.patient), detail: `${num(r.quantite)}× ${r.item} ($${num(r.total)})`, par: str(r.par), at: String(r.createdAt) });
  for (const r of point || []) items.push({ id: "p" + r.id, module: "Pointage", action: "Fin de service", cible: String(r.nom), detail: `${Math.floor(num(r.dureeMin) / 60)}h${String(num(r.dureeMin) % 60).padStart(2, "0")}`, par: null, at: String(r.fin) });
  for (const r of frais || []) items.push({ id: "f" + r.id, module: "Frais", action: String(r.statut), cible: String(r.objet), detail: `$${num(r.montant)}`, par: str(r.par), at: String(r.updatedAt) });
  for (const r of factures || []) items.push({ id: "fa" + r.id, module: "Factures", action: String(r.statut), cible: String(r.objet), detail: `$${num(r.montant)}`, par: str(r.par), at: String(r.updatedAt) });
  for (const r of certs || []) items.push({ id: "c" + r.id, module: "Certificats", action: String(r.type), cible: String(r.patient), detail: null, par: str(r.par), at: String(r.createdAt) });
  for (const r of rapports || []) items.push({ id: "r" + r.id, module: "Rapports", action: "Rapport", cible: String(r.titre), detail: null, par: str(r.par), at: String(r.createdAt) });
  for (const r of docs || []) items.push({ id: "d" + r.id, module: "Documents", action: "Ajout", cible: String(r.titre), detail: null, par: str(r.par), at: String(r.createdAt) });
  for (const r of salaries || []) items.push({ id: "s" + r.id, module: "RH", action: "Fiche", cible: String(r.nom), detail: String(r.statut), par: str(r.updatedBy), at: String(r.updatedAt) });
  for (const r of matieres || []) items.push({ id: "mp" + r.id, module: "Matières", action: "Mise à jour", cible: String(r.nom), detail: `${num(r.quantite)} u`, par: str(r.updatedBy), at: String(r.updatedAt) });
  for (const r of fdo || []) items.push({ id: "fo" + r.id, module: "FDO", action: "Soin", cible: `${r.bureau}${r.agent ? " · " + r.agent : ""}`, detail: `$${num(r.montant)}`, par: str(r.par), at: String(r.createdAt) });

  const clean = items.filter((i) => i.at && i.at !== "null" && i.at !== "undefined").sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, 150);
  const modules = [...new Set(clean.map((i) => i.module))].sort();
  return { pret, items: clean, modules };
}
