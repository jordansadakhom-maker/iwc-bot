"use client";

import { useEffect } from "react";
import { battreCoeur } from "@/app/dispensaire/pointage/actions";

// Signal de présence (« heartbeat ») du service ouvert du compte connecté : tant
// que l'onglet est ouvert et visible, on prévient le serveur toutes les 60 s. Si
// le signal cesse (navigateur fermé, déconnexion, inactivité), le service passe
// « à confirmer » — jamais clôturé de force. Ne rend rien à l'écran.
export function DispensaireKeepalive({ id }: { id: string }) {
  useEffect(() => {
    if (!id) return;
    let stop = false;
    const ping = () => { if (!stop && typeof document !== "undefined" && document.visibilityState === "visible") battreCoeur(id).catch(() => {}); };
    ping(); // signal immédiat à l'arrivée (couvre une reprise après coupure)
    const t = setInterval(ping, 60000);
    const onVis = () => { if (typeof document !== "undefined" && document.visibilityState === "visible") ping(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { stop = true; clearInterval(t); document.removeEventListener("visibilitychange", onVis); };
  }, [id]);
  return null;
}
