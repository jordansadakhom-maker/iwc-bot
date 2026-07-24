import "server-only";

import { getStats } from "@/lib/dispensaire-stats";
import { echantillonner, type Kpi } from "@/lib/erp-kpi-const";

const fmt = (n: number) => new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(n);

// KPI Dispensaire — réutilise les agrégats déjà calculés (getStats).
export async function getKpisDispensaire(): Promise<Kpi[]> {
  try {
    const s = await getStats();
    if (!s.pret) return [];
    const resultat = s.kpis.caMois - s.kpis.depensesMois;
    return [
      { id: "ca", label: "CA du mois", value: `$${fmt(s.kpis.caMois)}`, tone: "var(--good)", spark: echantillonner(s.caParJour.map((b) => b.valeur)) },
      { id: "depenses", label: "Dépenses du mois", value: `$${fmt(s.kpis.depensesMois)}`, tone: "var(--warn)" },
      { id: "resultat", label: "Résultat du mois", value: `$${fmt(resultat)}`, tone: resultat >= 0 ? "var(--good)" : "var(--oxblood)" },
      { id: "service", label: "En service", value: fmt(s.kpis.enService), sub: `/ ${fmt(s.kpis.salariesActifs)} actifs` },
      { id: "alerte", label: "Articles en alerte", value: fmt(s.kpis.articlesAlerte), tone: s.kpis.articlesAlerte ? "var(--oxblood)" : "var(--muted)" },
      { id: "factures", label: "Factures impayées", value: `$${fmt(s.kpis.du)}`, tone: s.kpis.du ? "var(--warn)" : "var(--muted)", sub: `${fmt(s.kpis.facturesImpayees)} facture(s)` },
    ];
  } catch { return []; }
}
