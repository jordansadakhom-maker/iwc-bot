import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

// Préférences du tableau de bord, mémorisées PAR COMPTE (clé = identifiant du
// membre) : ordre des widgets + widgets masqués. Dégrade proprement si la table
// n'existe pas encore (SQL non lancé) → cockpit dans son ordre par défaut.
export type DashboardPrefs = { ordre: string[]; masques: string[] };

const arr = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => String(x)).slice(0, 50) : []);

export async function getDashboardPrefs(identifiant: string | null): Promise<DashboardPrefs> {
  const vide: DashboardPrefs = { ordre: [], masques: [] };
  if (!identifiant) return vide;
  const admin = createAdminClient();
  if (!admin) return vide;
  try {
    const { data, error } = await admin.from("DispensaireDashboardPrefs").select("ordre,masques").eq("identifiant", identifiant).maybeSingle();
    if (error || !data) return vide;
    const r = data as Record<string, unknown>;
    return { ordre: arr(r.ordre), masques: arr(r.masques) };
  } catch { return vide; }
}
