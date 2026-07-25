"use server";

import { setEtatOverlay } from "@/lib/notif-etat";
import { TABLE_ETAT_DISPENSAIRE } from "@/lib/dispensaire-assistant";
import { getRoleDispensaire } from "@/lib/dispensaire-roles";
import { createAdminClient } from "@/lib/supabase/admin";
import { terminerService } from "@/app/dispensaire/pointage/actions";
import type { ActionConstatResult } from "@/lib/erp-assistant-const";

// Change l'état d'une notification du DISPENSAIRE (couche persistée).
// Gardé par la liste blanche : un compte non autorisé ne peut pas écrire
// (le layout protège l'affichage, pas l'appel direct à l'action).
export async function setEtatNotif(id: string, etat: string): Promise<{ ok: boolean; error?: string }> {
  try { if (!(await getRoleDispensaire()).autorise) return { ok: false, error: "Accès refusé." }; } catch { return { ok: false, error: "Accès refusé." }; }
  return setEtatOverlay(TABLE_ETAT_DISPENSAIRE, id, etat);
}

// Exécute l'action inline d'un constat du Dispensaire (« régler en 1 clic »).
export async function executerConstat(kind: string): Promise<ActionConstatResult> {
  try { if (!(await getRoleDispensaire()).autorise) return { ok: false, error: "Accès refusé." }; } catch { return { ok: false, error: "Accès refusé." }; }
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service indisponible." };
  if (kind === "clore-pointages") {
    const iso12 = new Date(Date.now() - 12 * 3600000).toISOString();
    const { data } = await admin.from("DispensairePointage").select("id").is("fin", null).lt("debut", iso12);
    const ids = ((data as { id: string }[]) || []).map((r) => r.id);
    let n = 0; let lastErr: string | undefined;
    for (const id of ids) { const r = await terminerService(id); if (r.ok) n++; else lastErr = r.error; }
    if (n === 0 && ids.length) return { ok: false, error: lastErr || "Aucun service clôturé." };
    return { ok: true, message: `${n} service(s) clôturé(s).` };
  }
  return { ok: false, error: "Action inconnue." };
}
