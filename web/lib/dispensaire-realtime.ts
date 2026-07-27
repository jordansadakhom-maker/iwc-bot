"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

// Abonnement TEMPS RÉEL du Dispensaire : le navigateur écoute la table SIGNAL
// (DispensaireRealtimeSignal) que le serveur pousse à chaque événement métier.
// Aucune donnée sensible ne transite — le signal ne porte qu'un horodatage ; les
// données réelles restent lues côté serveur.
//
// TOLÉRANT : si Realtime n'est pas configuré (SQL non lancé) ou indisponible,
// l'abonnement échoue silencieusement — le repli par polling reste le filet.
export function useDispensaireRealtime(onChange: () => void): void {
  const ref = useRef(onChange);
  ref.current = onChange;
  useEffect(() => {
    let cleanup = () => {};
    try {
      const supabase = createClient();
      const channel = supabase
        .channel("dispensaire-signal")
        .on("postgres_changes", { event: "*", schema: "public", table: "DispensaireRealtimeSignal" }, () => { try { ref.current(); } catch { /* ignore */ } })
        .subscribe();
      cleanup = () => { try { supabase.removeChannel(channel); } catch { /* ignore */ } };
    } catch { /* no-op */ }
    return () => cleanup();
  }, []);
}
