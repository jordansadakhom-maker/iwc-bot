import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getStatistiques } from "@/lib/queries";
import { echantillonner, type Kpi } from "@/lib/erp-kpi-const";

const fmt = (n: number) => new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(n);

// KPI Iron Wolf — réutilise les agrégats déjà calculés (getStatistiques).
export async function getKpisIWC(): Promise<Kpi[]> {
  try {
    const s = await getStatistiques();
    if (!s.connecte) return [];
    const kpis: Kpi[] = [
      { id: "coffre", label: "Coffre armurerie", value: `$${fmt(s.kpis.coffreArmurerie)}`, tone: s.kpis.coffreArmurerie >= 0 ? "var(--good)" : "var(--oxblood)", spark: echantillonner(s.coffreEvolution.map((p) => p.v)) },
      { id: "membres", label: "Membres", value: fmt(s.kpis.membres) },
      { id: "ops", label: "Opérations terminées", value: fmt(s.kpis.opsTerminees) },
      { id: "aptes", label: "Aptes (médical)", value: fmt(s.kpis.aptes) },
    ];
    // Socle récent (Phase 4) — tâches en cours (table optionnelle : ignorée si absente).
    try {
      const admin = createAdminClient();
      if (admin) {
        const { count, error } = await admin.from("Tache").select("*", { count: "exact", head: true }).neq("statut", "faite");
        if (!error && count != null) kpis.push({ id: "taches", label: "Tâches en cours", value: fmt(count) });
      }
    } catch { /* table optionnelle */ }
    return kpis;
  } catch { return []; }
}
