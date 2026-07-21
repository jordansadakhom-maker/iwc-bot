"use server";

import { getAlertes, type AlertesData } from "@/lib/queries";

// Rafraîchit les alertes (la cloche) à la demande du client — mêmes données que
// les pings Discord (RDV, candidatures, télégrammes, contrats…). Permet un
// centre de notifications « en direct » sur le site.
export async function rafraichirAlertes(): Promise<AlertesData> {
  return getAlertes();
}
