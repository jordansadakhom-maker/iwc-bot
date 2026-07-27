import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getDashboard, getAlertes, getAbsences } from "@/lib/queries";
import type { Cockpit } from "@/lib/cockpit";

// Agrégat consolidé « Mode Direction ». Réutilise les getters existants
// (dashboard, alertes, absences) et complète avec les modules récents (armurerie,
// tâches, conversations). TOLÉRANT : chaque lecture optionnelle est isolée, une
// table absente n'empêche jamais le reste de s'afficher.

const VIDE: Cockpit = {
  connecte: false, pole: "iwc",
  tresorerie: { commun: null, legal: null, illegal: null, armurerie: null, total: 0 },
  effectifs: { total: 0, presents: 0, absents: 0 },
  charge: { contratsEnCours: 0, opsActives: 0 },
  taches: { enCours: 0, enRetard: 0 },
  conversations: { ouvertes: 0, total: 0 },
  attention: [], attentionTotal: 0,
};

export async function getCockpit(): Promise<Cockpit> {
  const admin = createAdminClient();
  if (!admin) return VIDE;

  const [dash, alertes, absencesData] = await Promise.all([
    getDashboard().catch(() => null),
    getAlertes().catch(() => ({ total: 0, items: [] })),
    getAbsences().catch(() => null),
  ]);

  // Coffre de l'armurerie (optionnel).
  let armurerie: number | null = null;
  try {
    const { data } = await admin.from("ArmurerieCoffre").select("solde").eq("id", "vanhorn").maybeSingle();
    if (data && data.solde != null) armurerie = Number(data.solde);
  } catch { /* table optionnelle */ }

  // Tâches (module Phase 4) — en cours & en retard.
  let tEnCours = 0, tEnRetard = 0;
  try {
    const { data, error } = await admin.from("Tache").select("statut,echeance").neq("statut", "faite").limit(1000);
    if (!error) {
      const now = Date.now();
      for (const t of (data || []) as { statut: string; echeance: string | null }[]) {
        tEnCours++;
        const e = t.echeance ? new Date(t.echeance).getTime() : NaN;
        if (Number.isFinite(e) && e < now) tEnRetard++;
      }
    }
  } catch { /* table optionnelle */ }

  // Conversations (module Phase 4) — ouvertes & total.
  let cOuvertes = 0, cTotal = 0;
  try {
    const { data, error } = await admin.from("Conversation").select("statut").limit(1000);
    if (!error) {
      for (const c of (data || []) as { statut: string }[]) { cTotal++; if (c.statut !== "archivee") cOuvertes++; }
    }
  } catch { /* table optionnelle */ }

  const coffres = dash?.coffres ?? { commun: null, legal: null, illegal: null };
  const total = [coffres.commun, coffres.legal, coffres.illegal, armurerie].reduce<number>((s, v) => s + (typeof v === "number" ? v : 0), 0);
  const membresCount = dash?.membresCount ?? 0;
  const absents = absencesData?.absents?.length ?? 0;

  return {
    connecte: !!dash?.connecte,
    pole: dash?.pole ?? "iwc",
    tresorerie: { commun: coffres.commun, legal: coffres.legal, illegal: coffres.illegal, armurerie, total },
    effectifs: { total: membresCount, presents: Math.max(0, membresCount - absents), absents },
    charge: { contratsEnCours: dash?.contratsEnCours ?? 0, opsActives: dash?.opsActives ?? 0 },
    taches: { enCours: tEnCours, enRetard: tEnRetard },
    conversations: { ouvertes: cOuvertes, total: cTotal },
    attention: alertes.items, attentionTotal: alertes.total,
  };
}
