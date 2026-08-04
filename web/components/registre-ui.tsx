import type { LucideIcon } from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// Kit « registre » partagé — primitives immersives réutilisables par les pages.
// 100 % compatibles serveur (aucun hook, aucune fonction/icône passée au client).
// ─────────────────────────────────────────────────────────────────────────────

export type Plaque = { icon: LucideIcon; label: string; val: string; sous?: string };

// Bandeau de synthèse « plaques de laiton » — le repère chiffré d'un écran, d'un
// coup d'œil. Même langage visuel que Finances / Membres.
export function PlaqueBand({ items, cols = 4 }: { items: Plaque[]; cols?: 2 | 3 | 4 | 5 }) {
  const gridCols = cols === 5 ? "lg:grid-cols-5" : cols === 3 ? "lg:grid-cols-3" : cols === 2 ? "lg:grid-cols-2" : "lg:grid-cols-4";
  return (
    <div className={"grid gap-3 sm:grid-cols-2 " + gridCols}>
      {items.map((k) => {
        const Icon = k.icon;
        return (
          <div key={k.label} className="rounded-card border border-border p-4 shadow-card" style={{ background: "linear-gradient(180deg,color-mix(in srgb,var(--surface) 94%,var(--brass)),color-mix(in srgb,var(--surface) 86%,#000))" }}>
            <div className="flex items-center gap-1.5 text-[0.64rem] font-semibold uppercase tracking-[0.1em] text-faint"><Icon className="h-3.5 w-3.5" style={{ color: "var(--brass)" }} /> {k.label}</div>
            <div className="mt-2 font-num text-[1.5rem] font-semibold tabular" style={{ color: "var(--brass-hi)" }}>{k.val}</div>
            {k.sous ? <div className="mt-0.5 text-[0.66rem] text-faint">{k.sous}</div> : null}
          </div>
        );
      })}
    </div>
  );
}

// Tampon encré (statut apposé sur un document) — réutilisable.
export function Tampon({ texte, tone = "var(--oxblood)", className = "" }: { texte: string; tone?: string; className?: string }) {
  return (
    <span className={"inline-block rounded border px-2 py-0.5 text-[0.62rem] font-bold uppercase tracking-[0.14em] " + className}
      style={{ transform: "rotate(-6deg)", borderColor: tone, color: tone, borderWidth: 2, boxShadow: `inset 0 0 0 2px color-mix(in srgb,${tone} 14%,transparent)` }}>
      {texte}
    </span>
  );
}
