"use server";

import { setEtatOverlay } from "@/lib/notif-etat";
import { TABLE_ETAT_IWC } from "@/lib/assistant-iwc";

// Change l'état d'une notification de veille IRON WOLF (couche persistée).
export async function setEtatNotif(id: string, etat: string): Promise<{ ok: boolean; error?: string }> {
  return setEtatOverlay(TABLE_ETAT_IWC, id, etat);
}
