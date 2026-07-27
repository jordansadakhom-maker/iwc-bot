"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

// Abonnement TEMPS RÉEL du navigateur aux nouvelles notifications (Supabase
// Realtime, canal postgres_changes sur la table "Notification").
//
// Entièrement TOLÉRANT : si l'environnement n'est pas configuré, si le membre
// n'a pas de session, ou si la réplication temps réel n'est pas encore activée
// (SQL non lancé), la souscription échoue silencieusement et renvoie un no-op.
// Le polling 25 s existant reste le filet — rien ne casse jamais.

export type NotifRealtime = Record<string, unknown> & { id?: string; type?: string; titre?: string; lien?: string };

export function souscrireNotifications(onInsert: (n: NotifRealtime) => void): () => void {
  try {
    const supabase = createClient();
    const channel = supabase
      .channel("centre-notifications")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "Notification" },
        (payload: { new?: NotifRealtime }) => {
          try { onInsert((payload?.new || {}) as NotifRealtime); } catch { /* ignore */ }
        },
      )
      .subscribe();
    return () => { try { supabase.removeChannel(channel); } catch { /* ignore */ } };
  } catch {
    return () => {};
  }
}

// Hook : souscrit une seule fois et appelle toujours le handler le plus récent.
export function useNotificationsRealtime(onInsert: (n: NotifRealtime) => void): void {
  const ref = useRef(onInsert);
  ref.current = onInsert;
  useEffect(() => souscrireNotifications((n) => ref.current(n)), []);
}

// ── Messagerie temps réel ────────────────────────────────────────────────────
// Mêmes garanties de tolérance. Requiert conversations-realtime.sql (publication
// + RLS lecture) ; sinon no-op silencieux (le rechargement à l'ouverture reste).

// Nouveaux messages d'UN fil (filtre côté serveur sur conversationId).
export function souscrireMessages(conversationId: string, onEvent: () => void): () => void {
  if (!conversationId) return () => {};
  try {
    const supabase = createClient();
    const channel = supabase
      .channel(`fil-${conversationId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "Message", filter: `conversationId=eq.${conversationId}` },
        () => { try { onEvent(); } catch { /* ignore */ } },
      )
      .subscribe();
    return () => { try { supabase.removeChannel(channel); } catch { /* ignore */ } };
  } catch {
    return () => {};
  }
}

// Toute évolution de la liste des conversations (création, nouveau dernier message).
export function souscrireConversations(onEvent: () => void): () => void {
  try {
    const supabase = createClient();
    const channel = supabase
      .channel("liste-conversations")
      .on("postgres_changes", { event: "*", schema: "public", table: "Conversation" }, () => { try { onEvent(); } catch { /* ignore */ } })
      .subscribe();
    return () => { try { supabase.removeChannel(channel); } catch { /* ignore */ } };
  } catch {
    return () => {};
  }
}

// Hook fil ouvert : (re)souscrit quand la conversation sélectionnée change.
export function useMessagesRealtime(conversationId: string | null, onEvent: () => void): void {
  const ref = useRef(onEvent);
  ref.current = onEvent;
  useEffect(() => {
    if (!conversationId) return;
    return souscrireMessages(conversationId, () => ref.current());
  }, [conversationId]);
}

// Hook liste des conversations : souscrit une fois.
export function useConversationsRealtime(onEvent: () => void): void {
  const ref = useRef(onEvent);
  ref.current = onEvent;
  useEffect(() => souscrireConversations(() => ref.current()), []);
}
