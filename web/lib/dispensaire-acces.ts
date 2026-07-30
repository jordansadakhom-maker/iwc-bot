import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { peutAdministrer } from "@/lib/dispensaire-roles";

// Historique des accès aux modules sensibles (espace Direction) — réservé à la
// direction (admin). Dégradation propre si la table n'existe pas encore.
export type AccesEntree = { id: string; nom: string; role: string | null; module: string; moduleLabel: string; ouvertAt: string; dureeSec: number | null };
export type HistoriqueAccesData = { pret: boolean; peut: boolean; entrees: AccesEntree[] };

export async function getHistoriqueAcces(): Promise<HistoriqueAccesData> {
  const admin = createAdminClient();
  if (!admin) return { pret: false, peut: false, entrees: [] };
  const peut = await peutAdministrer();
  if (!peut) return { pret: true, peut: false, entrees: [] };
  try {
    const { data, error } = await admin.from("DispensaireAcces").select("*").order("ouvertAt", { ascending: false }).limit(500);
    if (error) return { pret: false, peut: true, entrees: [] };
    const entrees: AccesEntree[] = ((data || []) as Record<string, unknown>[]).map((r) => ({
      id: String(r.id), nom: String(r.nom || "?"), role: r.role == null ? null : String(r.role),
      module: String(r.module || ""), moduleLabel: String(r.moduleLabel || r.module || ""),
      ouvertAt: String(r.ouvertAt || ""), dureeSec: r.dureeSec == null ? null : Number(r.dureeSec),
    }));
    return { pret: true, peut: true, entrees };
  } catch { return { pret: false, peut: true, entrees: [] }; }
}
