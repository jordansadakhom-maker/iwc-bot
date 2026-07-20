import { db, configured } from "./supabase";
import { LIMITE_BANDAGES } from "./const";

export type Salarie = { id: string; nom: string; niveau: string | null; qualifications: string | null; compteBancaire: string | null; telegramme: string | null; actif: boolean };
export type FactureRow = { id: string; patient: string; montant: number; motif: string | null; echeance: string | null; paye: boolean; createdAt: string };
export type Service = { id: string; salarieNom: string; debut: string };
export type StockLigne = { id: string; nom: string; categorie: string; lieu: string | null; quantite: number; seuil: number; unite: string | null };
export type Mouvement = { id: string; stockNom: string; delta: number; quantiteApres: number | null; auteur: string | null; motif: string | null; createdAt: string };
export type Sherif = { id: string; bureau: string | null; nom: string; prixSoin: number };
export type Repert = { id: string; entreprise: string; categorie: string | null; contact: string | null; telegramme: string | null; notes: string | null };
export type Doc = { id: string; titre: string; categorie: string | null; url: string | null; notes: string | null; createdAt: string };
export type VenteBandage = { id: string; patient: string; quantite: number; auteur: string | null; createdAt: string };

type Raw = Record<string, unknown>;
const s = (v: unknown) => (v == null ? null : String(v));
const n = (v: unknown) => Number(v) || 0;

export async function getSalaries(): Promise<Salarie[]> {
  const sb = db(); if (!sb) return [];
  const { data } = await sb.from("DispSalarie").select("*").eq("actif", true).order("nom", { ascending: true });
  return ((data as Raw[]) || []).map((r) => ({ id: String(r.id), nom: String(r.nom || "—"), niveau: s(r.niveau), qualifications: s(r.qualifications), compteBancaire: s(r.compteBancaire), telegramme: s(r.telegramme), actif: r.actif !== false }));
}

export async function getServicesEnCours(): Promise<Service[]> {
  const sb = db(); if (!sb) return [];
  const { data } = await sb.from("DispPointage").select("id,salarieNom,debut,fin").is("fin", null).order("debut", { ascending: true });
  return ((data as Raw[]) || []).map((r) => ({ id: String(r.id), salarieNom: String(r.salarieNom || "—"), debut: String(r.debut) }));
}

export async function getStock(): Promise<StockLigne[]> {
  const sb = db(); if (!sb) return [];
  const { data } = await sb.from("DispStock").select("*").order("categorie", { ascending: true }).order("nom", { ascending: true });
  return ((data as Raw[]) || []).map((r) => ({ id: String(r.id), nom: String(r.nom || "—"), categorie: String(r.categorie || "Matière"), lieu: s(r.lieu), quantite: n(r.quantite), seuil: n(r.seuil), unite: s(r.unite) }));
}

export async function getStockAlerte(): Promise<StockLigne[]> {
  return (await getStock()).filter((x) => x.seuil > 0 && x.quantite <= x.seuil);
}

export async function getMouvements(limit = 40): Promise<Mouvement[]> {
  const sb = db(); if (!sb) return [];
  const { data } = await sb.from("DispMouvement").select("*").order("createdAt", { ascending: false }).limit(limit);
  return ((data as Raw[]) || []).map((r) => ({ id: String(r.id), stockNom: String(r.stockNom || "—"), delta: n(r.delta), quantiteApres: r.quantiteApres == null ? null : n(r.quantiteApres), auteur: s(r.auteur), motif: s(r.motif), createdAt: String(r.createdAt || "") }));
}

export async function getSherifs(): Promise<Sherif[]> {
  const sb = db(); if (!sb) return [];
  const { data } = await sb.from("DispSherif").select("*").order("bureau", { ascending: true }).order("nom", { ascending: true });
  return ((data as Raw[]) || []).map((r) => ({ id: String(r.id), bureau: s(r.bureau), nom: String(r.nom || "—"), prixSoin: n(r.prixSoin) }));
}

export async function getRepertoire(): Promise<Repert[]> {
  const sb = db(); if (!sb) return [];
  const { data } = await sb.from("DispRepertoire").select("*").order("categorie", { ascending: true }).order("entreprise", { ascending: true });
  return ((data as Raw[]) || []).map((r) => ({ id: String(r.id), entreprise: String(r.entreprise || "—"), categorie: s(r.categorie), contact: s(r.contact), telegramme: s(r.telegramme), notes: s(r.notes) }));
}

export async function getDocuments(): Promise<Doc[]> {
  const sb = db(); if (!sb) return [];
  const { data } = await sb.from("DispDocument").select("*").order("createdAt", { ascending: false });
  return ((data as Raw[]) || []).map((r) => ({ id: String(r.id), titre: String(r.titre || "—"), categorie: s(r.categorie), url: s(r.url), notes: s(r.notes), createdAt: String(r.createdAt || "") }));
}

// Début de la semaine ISO (lundi 00:00, heure serveur).
export function debutSemaine(d = new Date()): Date {
  const x = new Date(d);
  const jour = (x.getDay() + 6) % 7; // 0 = lundi
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - jour);
  return x;
}

export async function getVentesSemaine(): Promise<VenteBandage[]> {
  const sb = db(); if (!sb) return [];
  const { data } = await sb.from("DispVenteBandage").select("*").gte("createdAt", debutSemaine().toISOString()).order("createdAt", { ascending: false });
  return ((data as Raw[]) || []).map((r) => ({ id: String(r.id), patient: String(r.patient || "—"), quantite: n(r.quantite), auteur: s(r.auteur), createdAt: String(r.createdAt || "") }));
}

export type Patient = { id: string; prenom: string | null; nom: string | null; dateNaissance: string | null; sexe: string | null; nationalite: string | null; numero: string | null; telegramme: string | null; groupeSanguin: string | null; allergies: string | null; notes: string | null; createdAt: string };
export async function getPatients(): Promise<Patient[]> {
  const sb = db(); if (!sb) return [];
  const { data } = await sb.from("DispPatient").select("*").order("nom", { ascending: true }).order("prenom", { ascending: true });
  return ((data as Raw[]) || []).map((r) => ({ id: String(r.id), prenom: s(r.prenom), nom: s(r.nom), dateNaissance: s(r.dateNaissance), sexe: s(r.sexe), nationalite: s(r.nationalite), numero: s(r.numero), telegramme: s(r.telegramme), groupeSanguin: s(r.groupeSanguin), allergies: s(r.allergies), notes: s(r.notes), createdAt: String(r.createdAt || "") }));
}

export type Certificat = { id: string; patient: string; type: string | null; praticien: string | null; dateActe: string | null; diagnostic: string | null; createdAt: string };
export async function getCertificats(limit = 15): Promise<Certificat[]> {
  const sb = db(); if (!sb) return [];
  const { data } = await sb.from("DispCertificat").select("*").order("createdAt", { ascending: false }).limit(limit);
  return ((data as Raw[]) || []).map((r) => ({ id: String(r.id), patient: String(r.patient || "—"), type: s(r.type), praticien: s(r.praticien), dateActe: s(r.dateActe), diagnostic: s(r.diagnostic), createdAt: String(r.createdAt || "") }));
}

export type Resume = { articles: number; alertes: number; enService: number; ventesSemaine: number; facturesRetard: number; salaries: number };
export async function getResume(): Promise<Resume> {
  const vide: Resume = { articles: 0, alertes: 0, enService: 0, ventesSemaine: 0, facturesRetard: 0, salaries: 0 };
  const sb = db(); if (!sb) return vide;
  const today = new Date().toISOString().slice(0, 10);
  const [stock, services, ventes, factures, salaries] = await Promise.all([
    getStock(), getServicesEnCours(), getVentesSemaine(),
    sb.from("DispFacture").select("echeance,paye"),
    sb.from("DispSalarie").select("id").eq("actif", true),
  ]);
  const facturesRetard = ((factures.data as Raw[]) || []).filter((f) => f.paye !== true && f.echeance && String(f.echeance) < today).length;
  return {
    articles: stock.length,
    alertes: stock.filter((x) => x.seuil > 0 && x.quantite <= x.seuil).length,
    enService: services.length,
    ventesSemaine: ventes.reduce((a, v) => a + v.quantite, 0),
    facturesRetard,
    salaries: ((salaries.data as Raw[]) || []).length,
  };
}

export { LIMITE_BANDAGES };
export const dbPrete = configured;
