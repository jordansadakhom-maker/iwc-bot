"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getActeur } from "@/lib/authz";
import { versActiviteItem, type ActiviteItem } from "@/lib/activite";

// Journal d'audit — lecture (réservée aux membres connectés). Lit "ActivityLog"
// via la clé service. Tolérant : liste vide si la table n'existe pas encore.
export async function listerActivite(): Promise<{ connecte: boolean; items: ActiviteItem[] }> {
  if (!(await getActeur())) return { connecte: false, items: [] };
  const admin = createAdminClient();
  if (!admin) return { connecte: false, items: [] };
  const { data, error } = await admin
    .from("ActivityLog")
    .select("id,module,action,cible,cibleId,par,at")
    .order("at", { ascending: false })
    .limit(300);
  if (error) return { connecte: true, items: [] };
  return { connecte: true, items: ((data || []) as Record<string, unknown>[]).map(versActiviteItem) };
}
