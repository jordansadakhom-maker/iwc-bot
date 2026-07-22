import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

// ── Statistiques du Dispensaire (agrégats pour la page graphiques) ───────────
export type Barre = { label: string; valeur: number; libelle?: string };
export type StatsData = {
  pret: boolean;
  kpis: { salariesActifs: number; enService: number; articles: number; articlesAlerte: number; matieresRupture: number; facturesImpayees: number; du: number; caMois: number; depensesMois: number; soinsFDO: number; montantFDO: number };
  heuresParJour: Barre[];      // 7 derniers jours (min)
  ventesParJour: Barre[];      // 14 derniers jours (nb bandages)
  caParJour: Barre[];          // 14 derniers jours ($)
  topProduits: Barre[];        // sorties de stock cumulées
  fdoParBureau: Barre[];       // $ par bureau
  absences: { justifiees: number; injustifiees: number };
};

const PARIS = "Europe/Paris";
const ymdParis = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: PARIS, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
const num = (v: unknown) => Number(v) || 0;
async function q<T>(p: PromiseLike<{ data: T | null }>): Promise<T | null> { try { return (await p).data; } catch { return null; } }

// Liste des n derniers jours civils (Paris), du plus ancien au plus récent.
function joursRecents(n: number): { ymd: string; label: string }[] {
  const todayYmd = ymdParis(new Date().toISOString());
  const base = new Date(todayYmd + "T12:00:00Z");
  const out: { ymd: string; label: string }[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(base);
    d.setUTCDate(d.getUTCDate() - i);
    const ymd = d.toISOString().slice(0, 10);
    const label = new Intl.DateTimeFormat("fr-FR", { timeZone: "UTC", weekday: "short" }).format(d).replace(".", "");
    out.push({ ymd, label });
  }
  return out;
}

export async function getStats(): Promise<StatsData> {
  const vide: StatsData = { pret: false, kpis: { salariesActifs: 0, enService: 0, articles: 0, articlesAlerte: 0, matieresRupture: 0, facturesImpayees: 0, du: 0, caMois: 0, depensesMois: 0, soinsFDO: 0, montantFDO: 0 }, heuresParJour: [], ventesParJour: [], caParJour: [], topProduits: [], fdoParBureau: [], absences: { justifiees: 0, injustifiees: 0 } };
  const admin = createAdminClient();
  if (!admin) return vide;

  const moisPrefix = ymdParis(new Date().toISOString()).slice(0, 7);

  const [sal, ouv, clos, ventes, mvts, fdo, factures, frais, stock, matieres] = await Promise.all([
    q<Record<string, unknown>[]>(admin.from("DispensaireSalarie").select("statut,absJustifiees,absInjustifiees")),
    q<Record<string, unknown>[]>(admin.from("DispensairePointage").select("id").is("fin", null)),
    q<Record<string, unknown>[]>(admin.from("DispensairePointage").select("debut,dureeMin").not("fin", "is", null).order("debut", { ascending: false }).limit(400)),
    q<Record<string, unknown>[]>(admin.from("DispensaireVente").select("total,quantite,item,createdAt").order("createdAt", { ascending: false }).limit(500)),
    q<Record<string, unknown>[]>(admin.from("DispensaireStockMouvement").select("nomItem,delta").order("createdAt", { ascending: false }).limit(500)),
    q<Record<string, unknown>[]>(admin.from("DispensaireSoinFDO").select("bureau,montant")),
    q<Record<string, unknown>[]>(admin.from("DispensaireFacture").select("montant,statut")),
    q<Record<string, unknown>[]>(admin.from("DispensaireFrais").select("montant,statut,createdAt")),
    q<Record<string, unknown>[]>(admin.from("DispensaireStock").select("stock,seuil")),
    q<Record<string, unknown>[]>(admin.from("DispensaireMatiere").select("quantite,seuil")),
  ]);

  const pret = sal !== null || clos !== null;

  // KPIs
  const salariesActifs = (sal || []).filter((r) => String(r.statut || "actif") === "actif").length;
  const enService = (ouv || []).length;
  const articles = (stock || []).length;
  const articlesAlerte = (stock || []).filter((r) => num(r.seuil) > 0 && num(r.stock) <= num(r.seuil)).length;
  const matieresRupture = (matieres || []).filter((r) => num(r.seuil) > 0 && num(r.quantite) <= num(r.seuil)).length;
  const ouverte = (s: string) => s === "non_payee" || s === "dossier_police";
  const facturesImpayees = (factures || []).filter((f) => ouverte(String(f.statut))).length;
  const du = (factures || []).filter((f) => ouverte(String(f.statut))).reduce((a, f) => a + num(f.montant), 0);
  const caMois = (ventes || []).filter((v) => ymdParis(String(v.createdAt)).startsWith(moisPrefix)).reduce((a, v) => a + num(v.total), 0);
  const depensesMois = (frais || []).filter((f) => String(f.statut) === "vire" && ymdParis(String(f.createdAt)).startsWith(moisPrefix)).reduce((a, f) => a + num(f.montant), 0);
  const soinsFDO = (fdo || []).length;
  const montantFDO = (fdo || []).reduce((a, f) => a + num(f.montant), 0);

  // Heures par jour (7 j)
  const j7 = joursRecents(7);
  const minParJour = new Map<string, number>();
  for (const c of clos || []) { const ymd = ymdParis(String(c.debut)); minParJour.set(ymd, (minParJour.get(ymd) || 0) + num(c.dureeMin)); }
  const heuresParJour: Barre[] = j7.map((d) => { const m = minParJour.get(d.ymd) || 0; return { label: d.label, valeur: m, libelle: m ? `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}` : "0" }; });

  // Ventes de bandages + CA par jour (14 j)
  const j14 = joursRecents(14);
  const nbParJour = new Map<string, number>(); const caPJ = new Map<string, number>();
  for (const v of ventes || []) { const ymd = ymdParis(String(v.createdAt)); if (/bandage/i.test(String(v.item || ""))) nbParJour.set(ymd, (nbParJour.get(ymd) || 0) + num(v.quantite)); caPJ.set(ymd, (caPJ.get(ymd) || 0) + num(v.total)); }
  const ventesParJour: Barre[] = j14.map((d) => ({ label: d.label, valeur: nbParJour.get(d.ymd) || 0 }));
  const caParJour: Barre[] = j14.map((d) => { const c = caPJ.get(d.ymd) || 0; return { label: d.label, valeur: c, libelle: `$${c}` }; });

  // Produits les plus utilisés (sorties cumulées)
  const sorties = new Map<string, number>();
  for (const m of mvts || []) { const d = num(m.delta); if (d < 0) sorties.set(String(m.nomItem), (sorties.get(String(m.nomItem)) || 0) + -d); }
  const topProduits: Barre[] = [...sorties.entries()].map(([label, valeur]) => ({ label, valeur })).sort((a, b) => b.valeur - a.valeur).slice(0, 6);

  // Soins FDO par bureau ($)
  const bureau = new Map<string, number>();
  for (const f of fdo || []) bureau.set(String(f.bureau), (bureau.get(String(f.bureau)) || 0) + num(f.montant));
  const fdoParBureau: Barre[] = [...bureau.entries()].map(([label, valeur]) => ({ label, valeur, libelle: `$${valeur}` })).sort((a, b) => b.valeur - a.valeur).slice(0, 8);

  // Absences
  const absences = { justifiees: (sal || []).reduce((a, r) => a + num(r.absJustifiees), 0), injustifiees: (sal || []).reduce((a, r) => a + num(r.absInjustifiees), 0) };

  return { pret, kpis: { salariesActifs, enService, articles, articlesAlerte, matieresRupture, facturesImpayees, du, caMois, depensesMois, soinsFDO, montantFDO }, heuresParJour, ventesParJour, caParJour, topProduits, fdoParBureau, absences };
}
