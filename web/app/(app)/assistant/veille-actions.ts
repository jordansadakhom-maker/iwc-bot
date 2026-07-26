"use server";

import { setEtatOverlay } from "@/lib/notif-etat";
import { TABLE_ETAT_IWC } from "@/lib/assistant-iwc";
import { createAdminClient } from "@/lib/supabase/admin";
import { terminerService } from "@/app/(app)/armurerie/actions";
import { getActeur } from "@/lib/authz";
import type { ActionConstatResult } from "@/lib/erp-assistant-const";

// Change l'état d'une notification de veille IRON WOLF (couche persistée).
export async function setEtatNotif(id: string, etat: string): Promise<{ ok: boolean; error?: string }> {
  if (!(await getActeur())) return { ok: false, error: "Accès refusé — réservé aux membres connectés." };
  return setEtatOverlay(TABLE_ETAT_IWC, id, etat);
}

// Exécute l'action inline d'un constat (« régler en 1 clic »). Chaque action
// réutilise les Server Actions existantes (donc leurs gardes) — additif, sûr.
export async function executerConstat(kind: string, _ref?: string): Promise<ActionConstatResult> {
  if (!(await getActeur())) return { ok: false, error: "Accès refusé — réservé aux membres connectés." };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service indisponible." };
  if (kind === "clore-pointages") {
    // Clôture tous les pointages armurerie restés ouverts > 12 h (via terminerService,
    // qui porte déjà le garde « armurier »).
    const iso12 = new Date(Date.now() - 12 * 3600000).toISOString();
    const { data } = await admin.from("ArmureriePointage").select("id").is("fin", null).lt("debut", iso12);
    const ids = ((data as { id: string }[]) || []).map((r) => r.id);
    let n = 0; let lastErr: string | undefined;
    for (const id of ids) { const r = await terminerService(id); if (r.ok) n++; else lastErr = r.error; }
    if (n === 0 && ids.length) return { ok: false, error: lastErr || "Aucun pointage clôturé." };
    return { ok: true, message: `${n} pointage(s) clôturé(s).` };
  }
  return { ok: false, error: "Action inconnue." };
}
