import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { peutFacturer } from "@/lib/dispensaire-roles";
import { ymdParis } from "@/lib/dispensaire-dates";
import { statutsDe } from "@/lib/dispensaire-facturation-const";

// ── Comptabilité & trésorerie (Lot 6) — 100 % dérivée ────────────────────────
// Aucune nouvelle table : le grand-livre et la trésorerie sont reconstruits à la
// lecture à partir des flux financiers réels (factures encaissées, ventes, soins
// FDO réglés = recettes ; notes de frais virées = dépenses). Zéro saisie manuelle.

export type Ecriture = { id: string; date: string; libelle: string; categorie: string; montant: number; type: "recette" | "depense" };
export type SourceTotal = { label: string; montant: number; type: "recette" | "depense" };
export type ComptabiliteData = {
  pret: boolean; canVoir: boolean;
  tresorerie: number; recettesTotal: number; depensesTotal: number;
  moisRecettes: number; moisDepenses: number; moisSolde: number; moisLabel: string;
  parSource: SourceTotal[]; ecritures: Ecriture[];
};

const num = (v: unknown) => Number(v) || 0;
async function q<T>(p: PromiseLike<{ data: T | null }>): Promise<T | null> { try { return (await p).data; } catch { return null; } }

export async function getComptabilite(): Promise<ComptabiliteData> {
  const vide: ComptabiliteData = { pret: false, canVoir: false, tresorerie: 0, recettesTotal: 0, depensesTotal: 0, moisRecettes: 0, moisDepenses: 0, moisSolde: 0, moisLabel: "", parSource: [], ecritures: [] };
  const admin = createAdminClient();
  if (!admin) return vide;
  const canVoir = await peutFacturer();
  if (!canVoir) return { ...vide, pret: true };

  const [factures, ventes, fdo, frais] = await Promise.all([
    q<Record<string, unknown>[]>(admin.from("DispensaireFacture").select("id,objet,destinataire,montant,statut,statuts,datePaiement,createdAt").order("createdAt", { ascending: false }).limit(1000)),
    q<Record<string, unknown>[]>(admin.from("DispensaireVente").select("id,patient,total,createdAt").order("createdAt", { ascending: false }).limit(1000)),
    q<Record<string, unknown>[]>(admin.from("DispensaireSoinFDO").select("id,bureau,montant,statut,createdAt").order("createdAt", { ascending: false }).limit(1000)),
    q<Record<string, unknown>[]>(admin.from("DispensaireFrais").select("id,objet,montant,statut,updatedAt,createdAt").order("createdAt", { ascending: false }).limit(1000)),
  ]);

  const ecritures: Ecriture[] = [];
  const srcRecette = new Map<string, number>();
  const srcDepense = new Map<string, number>();
  const addRecette = (src: string, m: number) => srcRecette.set(src, (srcRecette.get(src) || 0) + m);
  const addDepense = (src: string, m: number) => srcDepense.set(src, (srcDepense.get(src) || 0) + m);

  // Recettes : factures encaissées.
  for (const f of factures || []) {
    if (!statutsDe(f).includes("payee")) continue;
    const m = num(f.montant); if (!m) continue;
    ecritures.push({ id: "f" + f.id, date: String(f.datePaiement || f.createdAt || ""), libelle: String(f.destinataire || f.objet || "Facture"), categorie: "Facture", montant: m, type: "recette" });
    addRecette("Factures", m);
  }
  // Recettes : ventes comptoir.
  for (const v of ventes || []) {
    const m = num(v.total); if (!m) continue;
    ecritures.push({ id: "v" + v.id, date: String(v.createdAt || ""), libelle: `Vente — ${String(v.patient || "?")}`, categorie: "Vente", montant: m, type: "recette" });
    addRecette("Ventes", m);
  }
  // Recettes : soins FDO réglés.
  for (const s of fdo || []) {
    if (String(s.statut) !== "regle") continue;
    const m = num(s.montant); if (!m) continue;
    ecritures.push({ id: "o" + s.id, date: String(s.createdAt || ""), libelle: `Soin FDO — ${String(s.bureau || "?")}`, categorie: "FDO", montant: m, type: "recette" });
    addRecette("Soins FDO", m);
  }
  // Dépenses : notes de frais virées.
  for (const fr of frais || []) {
    if (String(fr.statut) !== "vire") continue;
    const m = num(fr.montant); if (!m) continue;
    ecritures.push({ id: "r" + fr.id, date: String(fr.updatedAt || fr.createdAt || ""), libelle: String(fr.objet || "Note de frais"), categorie: "Frais", montant: m, type: "depense" });
    addDepense("Notes de frais", m);
  }

  ecritures.sort((a, b) => String(b.date).localeCompare(String(a.date)));

  const recettesTotal = [...srcRecette.values()].reduce((a, b) => a + b, 0);
  const depensesTotal = [...srcDepense.values()].reduce((a, b) => a + b, 0);
  const moisPrefix = ymdParis().slice(0, 7);
  const dansLeMois = (d: string) => { try { return ymdParis(d).startsWith(moisPrefix); } catch { return false; } };
  const moisRecettes = ecritures.filter((e) => e.type === "recette" && dansLeMois(e.date)).reduce((a, e) => a + e.montant, 0);
  const moisDepenses = ecritures.filter((e) => e.type === "depense" && dansLeMois(e.date)).reduce((a, e) => a + e.montant, 0);

  const parSource: SourceTotal[] = [
    ...[...srcRecette.entries()].map(([label, montant]) => ({ label, montant, type: "recette" as const })),
    ...[...srcDepense.entries()].map(([label, montant]) => ({ label, montant, type: "depense" as const })),
  ].sort((a, b) => b.montant - a.montant);

  const moisLabel = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", month: "long", year: "numeric" }).format(new Date());

  return {
    pret: true, canVoir: true,
    tresorerie: recettesTotal - depensesTotal, recettesTotal, depensesTotal,
    moisRecettes, moisDepenses, moisSolde: moisRecettes - moisDepenses, moisLabel,
    parSource, ecritures: ecritures.slice(0, 120),
  };
}
