"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { DISP_DIRECTION } from "@/lib/dispensaire-nav";
import { ouvrirAcces, fermerAcces } from "@/app/dispensaire/acces-actions";

// Suit les accès aux modules SENSIBLES (espace Direction) : à l'ouverture d'un
// module Direction, journalise l'entrée ; au changement de page / fermeture,
// renseigne la durée. Se gère seul (n'agit que sur les routes Direction) et
// n'expose rien à l'écran. La journalisation réelle est décidée côté serveur
// (le module doit être autorisé pour le compte).
export function DispensaireAccesTracker() {
  const path = usePathname();
  useEffect(() => {
    const tab = DISP_DIRECTION.find((t) => path === t.href || path.startsWith(t.href + "/"));
    if (!tab) return;
    let id: string | null = null;
    let closed = false;
    const start = Date.now();
    ouvrirAcces(tab.href).then((r) => { if (r.ok && r.id) id = r.id; }).catch(() => {});
    const close = () => { if (closed || !id) return; closed = true; fermerAcces(id, Math.round((Date.now() - start) / 1000)).catch(() => {}); };
    const onHide = () => { if (typeof document !== "undefined" && document.visibilityState === "hidden") close(); };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", close);
    return () => { document.removeEventListener("visibilitychange", onHide); window.removeEventListener("pagehide", close); close(); };
  }, [path]);
  return null;
}
