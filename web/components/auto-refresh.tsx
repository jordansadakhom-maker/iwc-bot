"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Rafraîchissement périodique des données serveur (effet « temps réel » léger,
// sans abonnement). S'arrête quand l'onglet est masqué pour ne rien gaspiller.
export function AutoRefresh({ seconds = 30 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const ms = Math.max(10, seconds) * 1000;
    const t = setInterval(() => { if (document.visibilityState === "visible") router.refresh(); }, ms);
    return () => clearInterval(t);
  }, [router, seconds]);
  return null;
}
