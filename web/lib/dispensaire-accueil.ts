import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getAcces } from "@/lib/queries";

// ── Données consolidées du tableau de bord du Dispensaire ────────────────────
export type ServiceEnCours = { id: string; nom: string; grade: string | null; debut: string };
export type AlerteStock = { nom: string; stock: number; seuil: number; unite: string | null };
export type Activite = { id: string; type: string; texte: string; par: string | null; at: string };
export type AccueilData = {
  habilite: boolean;
  pret: boolean;
  enService: ServiceEnCours[];
  roster: { id: string; nom: string; grade: string | null }[];
  stockAlertes: AlerteStock[];
  matieresRupture: { nom: string; quantite: number; seuil: number; unite: string | null }[];
  facturesImpayees: number;
  facturesRetard: number;
  du: number;
  fraisEnAttente: number;
  ventesJourNb: number;
  ventesJourCa: number;
  activites: Activite[];
};

const PARIS = "Europe/Paris";
const ymdParis = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: PARIS, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
const num = (v: unknown) => Number(v) || 0;
const str = (v: unknown) => (v == null ? null : String(v));
async function q<T>(p: PromiseLike<{ data: T | null }>): Promise<T | null> { try { return (await p).data; } catch { return null; } }

export async function getAccueil(): Promise<AccueilData> {
  const vide: AccueilData = { habilite: false, pret: false, enService: [], roster: [], stockAlertes: [], matieresRupture: [], facturesImpayees: 0, facturesRetard: 0, du: 0, fraisEnAttente: 0, ventesJourNb: 0, ventesJourCa: 0, activites: [] };
  const admin = createAdminClient();
  if (!admin) return vide;

  let habilite = false;
  try { habilite = (await getAcces()).peutMedical; } catch { habilite = true; }
  const today = ymdParis(new Date().toISOString());

  const [rost, ouv, stock, matieres, factures, frais, ventes, mvts, ventesRec, pointRec, fraisRec, certsRec] = await Promise.all([
    q<Record<string, unknown>[]>(admin.from("DispensaireSalarie").select("id,nom,grade,statut").order("nom", { ascending: true })),
    q<Record<string, unknown>[]>(admin.from("DispensairePointage").select("id,nom,salarieId,debut").is("fin", null).order("debut", { ascending: true })),
    q<Record<string, unknown>[]>(admin.from("DispensaireStock").select("nom,stock,seuil,unite")),
    q<Record<string, unknown>[]>(admin.from("DispensaireMatiere").select("nom,quantite,seuil,unite")),
    q<Record<string, unknown>[]>(admin.from("DispensaireFacture").select("montant,statut,dateEcheance")),
    q<Record<string, unknown>[]>(admin.from("DispensaireFrais").select("statut")),
    q<Record<string, unknown>[]>(admin.from("DispensaireVente").select("total,createdAt").order("createdAt", { ascending: false }).limit(200)),
    q<Record<string, unknown>[]>(admin.from("DispensaireStockMouvement").select("id,nomItem,delta,par,createdAt").order("createdAt", { ascending: false }).limit(6)),
    q<Record<string, unknown>[]>(admin.from("DispensaireVente").select("id,patient,quantite,item,par,createdAt").order("createdAt", { ascending: false }).limit(6)),
    q<Record<string, unknown>[]>(admin.from("DispensairePointage").select("id,nom,dureeMin,fin").not("fin", "is", null).order("fin", { ascending: false }).limit(6)),
    q<Record<string, unknown>[]>(admin.from("DispensaireFrais").select("id,objet,statut,par,createdAt").order("createdAt", { ascending: false }).limit(6)),
    q<Record<string, unknown>[]>(admin.from("DispensaireCertificat").select("id,patient,type,par,createdAt").order("createdAt", { ascending: false }).limit(6)),
  ]);

  // Table de base absente → pas encore prêt.
  const pret = ouv !== null;

  const gradeDe = new Map<string, string | null>();
  const roster = (rost || []).filter((r) => String(r.statut || "actif") !== "renvoye").map((r) => { gradeDe.set(String(r.id), str(r.grade)); return { id: String(r.id), nom: String(r.nom || "Salarié"), grade: str(r.grade) }; });
  const enService: ServiceEnCours[] = (ouv || []).map((r) => ({ id: String(r.id), nom: String(r.nom || "Salarié"), grade: r.salarieId ? gradeDe.get(String(r.salarieId)) ?? null : null, debut: String(r.debut) }));

  const stockAlertes: AlerteStock[] = (stock || []).map((r) => ({ nom: String(r.nom || "Article"), stock: num(r.stock), seuil: num(r.seuil), unite: str(r.unite) })).filter((i) => i.seuil > 0 && i.stock <= i.seuil).sort((a, b) => a.stock - b.stock);
  const matieresRupture = (matieres || []).map((r) => ({ nom: String(r.nom || "Matière"), quantite: num(r.quantite), seuil: num(r.seuil), unite: str(r.unite) })).filter((i) => i.seuil > 0 && i.quantite <= i.seuil).sort((a, b) => a.quantite - b.quantite);

  const ouverte = (s: string) => s === "non_payee" || s === "dossier_police";
  const facturesImpayees = (factures || []).filter((f) => ouverte(String(f.statut))).length;
  const facturesRetard = (factures || []).filter((f) => ouverte(String(f.statut)) && f.dateEcheance && String(f.dateEcheance).slice(0, 10) < today).length;
  const du = (factures || []).filter((f) => ouverte(String(f.statut))).reduce((a, f) => a + num(f.montant), 0);
  const fraisEnAttente = (frais || []).filter((f) => String(f.statut) === "en_attente").length;

  const ventesJour = (ventes || []).filter((v) => ymdParis(String(v.createdAt)) === today);
  const ventesJourNb = ventesJour.length;
  const ventesJourCa = ventesJour.reduce((a, v) => a + num(v.total), 0);

  // Fil des dernières activités (dérivé des modules — un vrai journal d'audit arrive au Lot 4).
  const A: Activite[] = [];
  for (const m of mvts || []) A.push({ id: "m" + m.id, type: "stock", texte: `${num(m.delta) >= 0 ? "Entrée" : "Sortie"} ${Math.abs(num(m.delta))} · ${m.nomItem}`, par: str(m.par), at: String(m.createdAt) });
  for (const v of ventesRec || []) A.push({ id: "v" + v.id, type: "vente", texte: `Vente ${num(v.quantite)}× ${v.item} · ${v.patient}`, par: str(v.par), at: String(v.createdAt) });
  for (const p of pointRec || []) A.push({ id: "p" + p.id, type: "service", texte: `Fin de service · ${p.nom}`, par: null, at: String(p.fin) });
  for (const f of fraisRec || []) A.push({ id: "f" + f.id, type: "frais", texte: `Note de frais · ${f.objet}`, par: str(f.par), at: String(f.createdAt) });
  for (const c of certsRec || []) A.push({ id: "c" + c.id, type: "certificat", texte: `Certificat · ${c.patient}`, par: str(c.par), at: String(c.createdAt) });
  const activites = A.filter((a) => a.at && a.at !== "null").sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, 10);

  return { habilite, pret, enService, roster, stockAlertes, matieresRupture, facturesImpayees, facturesRetard, du, fraisEnAttente, ventesJourNb, ventesJourCa, activites };
}
