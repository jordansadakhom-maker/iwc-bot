"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useDispensaireRealtime } from "@/lib/dispensaire-realtime";

// Rafraîchit la vue courante EN TEMPS RÉEL via le signal Supabase Realtime, avec
// un repli par polling (filet de sécurité si Realtime n'est pas actif). Le
// rafraîchissement Realtime est débouncé pour absorber les rafales d'événements.
export function RealtimeRefresh({ fallbackSeconds = 60 }: { fallbackSeconds?: number }) {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useDispensaireRealtime(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { if (document.visibilityState === "visible") router.refresh(); }, 700);
  });

  useEffect(() => {
    const ms = Math.max(20, fallbackSeconds) * 1000;
    const t = setInterval(() => { if (document.visibilityState === "visible") router.refresh(); }, ms);
    return () => { clearInterval(t); if (timer.current) clearTimeout(timer.current); };
  }, [router, fallbackSeconds]);

  return null;
}
