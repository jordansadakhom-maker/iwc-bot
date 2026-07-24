"use server";

import { setEtatOverlay } from "@/lib/notif-etat";
import { TABLE_ETAT_DISPENSAIRE } from "@/lib/dispensaire-assistant";
import { getRoleDispensaire } from "@/lib/dispensaire-roles";

// Change l'état d'une notification du DISPENSAIRE (couche persistée).
// Gardé par la liste blanche : un compte non autorisé ne peut pas écrire
// (le layout protège l'affichage, pas l'appel direct à l'action).
export async function setEtatNotif(id: string, etat: string): Promise<{ ok: boolean; error?: string }> {
  try { if (!(await getRoleDispensaire()).autorise) return { ok: false, error: "Accès refusé." }; } catch { return { ok: false, error: "Accès refusé." }; }
  return setEtatOverlay(TABLE_ETAT_DISPENSAIRE, id, etat);
}
