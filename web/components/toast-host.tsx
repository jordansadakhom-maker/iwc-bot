"use client";

import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import { useToasts, dismissToast, type Toast } from "@/lib/toast";

// Affiche les toasts (un seul par page). Non bloquant, empilé en bas à droite,
// accessible (role=status, aria-live). Se monte une fois près de la racine.
const TONE: Record<Toast["tone"], { border: string; color: string; icon: typeof Info }> = {
  bad: { border: "color-mix(in srgb,var(--oxblood) 55%,var(--border))", color: "var(--oxblood)", icon: AlertTriangle },
  ok: { border: "color-mix(in srgb,var(--good) 50%,var(--border))", color: "var(--good)", icon: CheckCircle2 },
  info: { border: "color-mix(in srgb,var(--accent) 45%,var(--border))", color: "var(--accent)", icon: Info },
};

export function ToastHost() {
  const toasts = useToasts();
  if (!toasts.length) return null;
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[200] flex max-w-[calc(100vw-2rem)] flex-col gap-2" role="status" aria-live="polite">
      {toasts.map((t) => {
        const ton = TONE[t.tone];
        const Icon = ton.icon;
        return (
          <div key={t.id} className="pointer-events-auto flex items-start gap-2 rounded-[12px] border bg-surface px-3.5 py-2.5 text-[0.84rem] shadow-lg" style={{ borderColor: ton.border }}>
            <Icon className="mt-0.5 h-4 w-4 shrink-0" style={{ color: ton.color }} />
            <span className="min-w-0 flex-1">{t.msg}</span>
            <button onClick={() => dismissToast(t.id)} className="shrink-0 text-faint transition hover:text-ink" aria-label="Fermer"><X className="h-3.5 w-3.5" /></button>
          </div>
        );
      })}
    </div>
  );
}
