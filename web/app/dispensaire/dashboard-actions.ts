"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getRoleDispensaire } from "@/lib/dispensaire-roles";

// Enregistre les préférences du tableau de bord du compte connecté (ordre +
// masquage des widgets). Ouvert à tout compte autorisé, chacun ne touche QUE
// sa propre ligne (clé = son identifiant). Best-effort, jamais bloquant.
export async function enregistrerDashboardPrefs(prefs: { ordre: string[]; masques: string[] }): Promise<{ ok: boolean }> {
  try {
    const role = await getRoleDispensaire();
    if (!role.autorise || !role.identifiant) return { ok: false };
    const admin = createAdminClient();
    if (!admin) return { ok: false };
    const clean = (v: unknown) => (Array.isArray(v) ? v.map((x) => String(x)).slice(0, 50) : []);
    const { error } = await admin
      .from("DispensaireDashboardPrefs")
      .upsert({ identifiant: role.identifiant, ordre: clean(prefs?.ordre), masques: clean(prefs?.masques), updatedAt: new Date().toISOString() }, { onConflict: "identifiant" });
    return { ok: !error };
  } catch {
    return { ok: false };
  }
}
