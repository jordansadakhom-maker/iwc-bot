import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionProfile } from "@/lib/queries";
import { ETATS, type Etat } from "@/lib/erp-assistant-const";

// Couche d'ÉTAT des notifications, persistée par-dessus les constats (dérivés).
// Chaque système a sa propre table (aucun mélange) : « DispensaireNotifEtat »
// pour le dispensaire, « NotifEtatIWC » pour l'Iron Wolf. Clé = id stable du
// constat. Dégrade proprement si la table n'existe pas encore.

export async function getEtatsOverlay(table: string): Promise<Record<string, Etat>> {
  const admin = createAdminClient();
  if (!admin) return {};
  try {
    const { data, error } = await admin.from(table).select("id,etat");
    if (error || !data) return {};
    const m: Record<string, Etat> = {};
    for (const r of data as Record<string, unknown>[]) {
      const e = String(r.etat) as Etat;
      if (ETATS.includes(e)) m[String(r.id)] = e;
    }
    return m;
  } catch { return {}; }
}

export async function setEtatOverlay(table: string, id: string, etat: string): Promise<{ ok: boolean; error?: string }> {
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  if (!id) return { ok: false, error: "Notification introuvable." };
  if (!ETATS.includes(etat as Etat)) return { ok: false, error: "État inconnu." };
  let qui = "Équipe";
  try { qui = (await getSessionProfile())?.nom || "Équipe"; } catch { /* anonyme */ }
  const { error } = await admin.from(table).upsert({ id: id.slice(0, 200), etat, updatedBy: qui, updatedAt: new Date().toISOString() }, { onConflict: "id" });
  return error ? { ok: false, error: "Enregistrement impossible (la table d'états existe-t-elle ?)." } : { ok: true };
}
