import "server-only";

import { getStatistiques } from "@/lib/queries";
import { echantillonner, type Kpi } from "@/lib/erp-kpi-const";

const fmt = (n: number) => new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(n);

// KPI Iron Wolf — réutilise les agrégats déjà calculés (getStatistiques).
export async function getKpisIWC(): Promise<Kpi[]> {
  try {
    const s = await getStatistiques();
    if (!s.connecte) return [];
    return [
      { id: "coffre", label: "Coffre armurerie", value: `$${fmt(s.kpis.coffreArmurerie)}`, tone: "var(--good)", spark: echantillonner(s.coffreEvolution.map((p) => p.v)) },
      { id: "membres", label: "Membres", value: fmt(s.kpis.membres) },
      { id: "ops", label: "Opérations terminées", value: fmt(s.kpis.opsTerminees) },
      { id: "aptes", label: "Aptes (médical)", value: fmt(s.kpis.aptes) },
    ];
  } catch { return []; }
}
