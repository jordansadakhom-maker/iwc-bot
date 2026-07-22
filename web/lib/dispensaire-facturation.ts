import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getAcces } from "@/lib/queries";
import { getConfig } from "@/lib/dispensaire-roles";
import {
  estBandage, factureOuverte,
  type Vente, type PatientSemaine, type VentesData,
  type Facture, type FacturesData,
  type SoinFDO, type BureauFDO, type FDOData,
  type Frais, type FraisData,
} from "@/lib/dispensaire-facturation-const";

export * from "@/lib/dispensaire-facturation-const";

const s = (v: unknown) => (v == null ? null : String(v));
const num = (v: unknown) => Number(v) || 0;

// ── Semaine civile (Paris) — pour l'agrégat des ventes ──────────────────────
const PARIS = "Europe/Paris";
function ymdParis(iso: string): string {
  const p = new Intl.DateTimeFormat("en-GB", { timeZone: PARIS, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(iso));
  const g = (t: string) => p.find((x) => x.type === t)?.value || "";
  return `${g("year")}-${g("month")}-${g("day")}`;
}
function dowParis(iso: string): number {
  const d = new Intl.DateTimeFormat("en-GB", { timeZone: PARIS, weekday: "short" }).format(new Date(iso));
  return ({ Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 } as Record<string, number>)[d] ?? 0;
}
function lundiCourant(): string {
  const now = new Date().toISOString();
  const base = new Date(ymdParis(now) + "T12:00:00Z");
  base.setUTCDate(base.getUTCDate() - dowParis(now));
  return base.toISOString().slice(0, 10);
}

// ── 1) Ventes ───────────────────────────────────────────────────────────────
export async function getVentes(): Promise<VentesData> {
  const cfg = await getConfig();
  const vide: VentesData = { connecte: false, pret: false, canEdit: false, ventes: [], semaine: [], caSemaine: 0, mondayYmd: "", prix: cfg.prixBandage, plafond: cfg.plafondBandage };
  const admin = createAdminClient();
  if (!admin) return vide;
  const monday = lundiCourant();
  const { data, error } = await admin.from("DispensaireVente").select("*").order("createdAt", { ascending: false }).limit(200);
  if (error) return { ...vide, connecte: true, pret: false, canEdit: true, mondayYmd: monday };
  const ventes: Vente[] = ((data || []) as Record<string, unknown>[]).map((r) => ({
    id: String(r.id), patient: String(r.patient || "?"), item: String(r.item || "Bandage"), quantite: num(r.quantite),
    prixUnitaire: num(r.prixUnitaire), total: num(r.total), note: s(r.note), par: s(r.par), createdAt: String(r.createdAt),
  }));
  // Agrégat semaine par patient (bandages + CA).
  const map = new Map<string, { bandages: number; total: number }>();
  let caSemaine = 0;
  for (const v of ventes) {
    if (ymdParis(v.createdAt) < monday) continue;
    caSemaine += v.total;
    const e = map.get(v.patient) || { bandages: 0, total: 0 };
    if (estBandage(v.item)) e.bandages += v.quantite;
    e.total += v.total;
    map.set(v.patient, e);
  }
  const semaine: PatientSemaine[] = [...map.entries()]
    .map(([patient, e]) => ({ patient, bandages: e.bandages, total: e.total, depasse: e.bandages > cfg.plafondBandage }))
    .sort((a, b) => Number(b.depasse) - Number(a.depasse) || b.bandages - a.bandages);
  return { connecte: true, pret: true, canEdit: true, ventes, semaine, caSemaine, mondayYmd: monday, prix: cfg.prixBandage, plafond: cfg.plafondBandage };
}

// ── 2) Factures (réservé aux chefs) ─────────────────────────────────────────
export async function getFactures(): Promise<FacturesData> {
  const vide: FacturesData = { connecte: false, pret: false, canEdit: false, factures: [], enRetard: 0, du: 0 };
  const admin = createAdminClient();
  if (!admin) return vide;
  let canEdit = false;
  try { canEdit = (await getAcces()).peutMedical; } catch { canEdit = true; }
  if (!canEdit) return { connecte: true, pret: true, canEdit: false, factures: [], enRetard: 0, du: 0 };
  const { data, error } = await admin.from("DispensaireFacture").select("*").order("dateEcheance", { ascending: true, nullsFirst: false }).limit(300);
  if (error) return { ...vide, connecte: true, pret: false, canEdit: true };
  const today = ymdParis(new Date().toISOString());
  const factures: Facture[] = ((data || []) as Record<string, unknown>[]).map((r) => ({
    id: String(r.id), objet: String(r.objet || "Facture"), destinataire: s(r.destinataire), montant: num(r.montant),
    dateEmission: s(r.dateEmission), dateEcheance: s(r.dateEcheance), statut: String(r.statut || "non_payee"),
    note: s(r.note), par: s(r.par), createdAt: String(r.createdAt),
  }));
  const enRetard = factures.filter((f) => factureOuverte(f.statut) && f.dateEcheance && f.dateEcheance.slice(0, 10) < today).length;
  const du = factures.filter((f) => factureOuverte(f.statut)).reduce((a, f) => a + f.montant, 0);
  return { connecte: true, pret: true, canEdit: true, factures, enRetard, du };
}

// ── 3) Soins FDO ────────────────────────────────────────────────────────────
export async function getFDO(): Promise<FDOData> {
  const vide: FDOData = { connecte: false, pret: false, canEdit: false, soins: [], bureaux: [] };
  const admin = createAdminClient();
  if (!admin) return vide;
  const { data, error } = await admin.from("DispensaireSoinFDO").select("*").order("createdAt", { ascending: false }).limit(300);
  if (error) return { ...vide, connecte: true, pret: false, canEdit: true };
  const soins: SoinFDO[] = ((data || []) as Record<string, unknown>[]).map((r) => ({
    id: String(r.id), bureau: String(r.bureau || "Bureau"), agent: s(r.agent), soin: s(r.soin), montant: num(r.montant),
    statut: String(r.statut || "offert"), note: s(r.note), par: s(r.par), createdAt: String(r.createdAt),
  }));
  const map = new Map<string, { nb: number; total: number }>();
  for (const x of soins) { const e = map.get(x.bureau) || { nb: 0, total: 0 }; e.nb += 1; e.total += x.montant; map.set(x.bureau, e); }
  const bureaux: BureauFDO[] = [...map.entries()].map(([bureau, e]) => ({ bureau, nb: e.nb, total: e.total })).sort((a, b) => a.bureau.localeCompare(b.bureau));
  return { connecte: true, pret: true, canEdit: true, soins, bureaux };
}

// ── 4) Notes de frais ───────────────────────────────────────────────────────
export async function getFrais(): Promise<FraisData> {
  const vide: FraisData = { connecte: false, pret: false, canValidate: false, frais: [], enAttente: 0 };
  const admin = createAdminClient();
  if (!admin) return vide;
  let canValidate = false;
  try { canValidate = (await getAcces()).peutMedical; } catch { canValidate = true; }
  const { data, error } = await admin.from("DispensaireFrais").select("*").order("createdAt", { ascending: false }).limit(300);
  if (error) return { ...vide, connecte: true, pret: false, canValidate };
  const frais: Frais[] = ((data || []) as Record<string, unknown>[]).map((r) => ({
    id: String(r.id), objet: String(r.objet || "Note de frais"), montant: num(r.montant), demandeur: s(r.demandeur),
    statut: String(r.statut || "en_attente"), validePar: s(r.validePar), note: s(r.note), par: s(r.par), createdAt: String(r.createdAt),
  }));
  const enAttente = frais.filter((f) => f.statut === "en_attente").length;
  return { connecte: true, pret: true, canValidate, frais, enAttente };
}
