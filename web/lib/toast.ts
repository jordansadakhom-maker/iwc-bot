"use client";

import { useSyncExternalStore } from "react";

// Petites notifications éphémères (« toasts ») — remplacent les pop-ups alert()
// du navigateur par un message intégré, non bloquant, cohérent avec le site.
// Store minimal en pub/sub : n'importe quel composant appelle toast(...) sans
// avoir à gérer un état local ; un seul <ToastHost/> les affiche.

export type Toast = { id: number; msg: string; tone: "bad" | "ok" | "info" };

let toasts: Toast[] = [];
const listeners = new Set<() => void>();
let seq = 0;
const EMPTY: Toast[] = [];

function emit() { for (const l of listeners) l(); }

export function toast(msg: string, tone: Toast["tone"] = "info") {
  const id = ++seq;
  toasts = [...toasts, { id, msg: String(msg || ""), tone }];
  emit();
  // Auto-disparition (setTimeout, pas de Date.now → sûr côté rendu).
  setTimeout(() => { toasts = toasts.filter((t) => t.id !== id); emit(); }, 4500);
}

// Raccourci pour les erreurs (le cas le plus fréquent, ex-alert()).
export const toastErreur = (msg: string) => toast(msg, "bad");
export const toastOk = (msg: string) => toast(msg, "ok");

export function dismissToast(id: number) { toasts = toasts.filter((t) => t.id !== id); emit(); }

export function useToasts(): Toast[] {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    () => toasts,
    () => EMPTY, // snapshot serveur stable (aucun toast au rendu initial)
  );
}
