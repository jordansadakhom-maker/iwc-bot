"use client";

import { X } from "lucide-react";

// Primitives partagées par les modales d'édition du site.

export const inputCls =
  "w-full rounded-[9px] border border-border bg-surface-2 px-2.5 py-1.5 text-[0.84rem] text-ink outline-none placeholder:text-faint focus:border-[color-mix(in_srgb,var(--accent)_55%,var(--border))]";

export function Flash({ children, tone = "good" }: { children: React.ReactNode; tone?: "good" | "bad" }) {
  const c = tone === "bad" ? "var(--oxblood)" : "var(--good)";
  return (
    <div className="rounded-lg border px-3 py-2 text-[0.78rem]" style={{ color: c, borderColor: "color-mix(in srgb," + c + " 40%,var(--border))", background: "color-mix(in srgb," + c + " 8%,transparent)" }}>
      {children}
    </div>
  );
}

export function Champ({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[0.72rem] uppercase tracking-[0.05em] text-faint">{label}</span>
      {children}
    </label>
  );
}

export function Picker({ options, value, onChange }: { options: { key: string; label: string; tone?: string }[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = value === o.key;
        const tone = o.tone || "var(--accent)";
        return (
          <button
            key={o.key}
            onClick={() => onChange(o.key)}
            className="rounded-lg border px-2.5 py-1.5 text-[0.78rem] font-semibold transition"
            style={{ color: on ? "#000" : tone, background: on ? tone : "transparent", borderColor: "color-mix(in srgb," + tone + " 45%,var(--border))" }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Modal({ titre, children, onClose, max = 500 }: { titre: string; children: React.ReactNode; onClose: () => void; max?: number }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="max-h-[88vh] w-full overflow-y-auto rounded-card border border-border bg-surface p-5 shadow-card"
        style={{ maxWidth: max, background: "linear-gradient(180deg,var(--surface),color-mix(in srgb,var(--surface) 88%,#000))" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="font-display text-xl">{titre}</div>
          <button onClick={onClose} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-border text-muted hover:text-ink" aria-label="Fermer">
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
