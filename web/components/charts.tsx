"use client";

// Graphiques légers en SVG/CSS pur — fiables sous React 19 (aucune dépendance),
// thème clair/sombre via tokens, libellés directs + survol interactif.

import { useState } from "react";

// ── Barres horizontales (magnitude, teinte laiton par défaut ; couleur/ligne
//    catégorielle possible). Survol : la barre s'illumine, sa valeur ressort. ──
function fmt(n: number, money?: boolean) {
  return money ? "$" + n.toLocaleString("fr-FR") : String(n);
}

export function BarresH({
  data,
  money,
}: {
  data: { label: string; value: number; color?: string }[];
  money?: boolean;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="flex flex-col gap-3">
      {data.map((d, i) => {
        const pct = d.value > 0 ? Math.max((d.value / max) * 100, 4) : 0;
        const on = hover === i;
        const base = d.color || "var(--accent)";
        return (
          <div
            key={d.label}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
            className="cursor-default transition-opacity"
            style={{ opacity: hover === null || on ? 1 : 0.55 }}
          >
            <div className="mb-1 flex items-baseline justify-between gap-2 text-[0.78rem]">
              <span className="truncate text-muted">{d.label}</span>
              <span className={"font-num font-semibold " + (on ? "text-ink" : "text-ink")} style={on ? { color: base } : undefined}>
                {fmt(d.value, money)}
              </span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full" style={{ background: "color-mix(in srgb,var(--ink) 8%,transparent)" }}>
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{
                  width: `${pct}%`,
                  background: `linear-gradient(90deg, color-mix(in srgb,${base} 60%,#000), ${base})`,
                  boxShadow: on ? `0 0 0 1px color-mix(in srgb,${base} 40%,transparent)` : "none",
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Donut (répartition), légende à libellés directs + survol (segment mis en
//    avant, centre affiche le libellé/valeur/part survolés). ──
export function Donut({ data }: { data: { label: string; value: number; color: string }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const sum = data.reduce((a, d) => a + d.value, 0);
  const R = 54, C = 2 * Math.PI * R, GAP = 6;
  let offset = 0;
  const segs = data.map((d, i) => {
    const len = sum > 0 ? (d.value / sum) * C : 0;
    const seg = Math.max(0, len - GAP);
    const on = hover === i;
    const node = d.value > 0 ? (
      <circle
        key={d.label}
        cx="70" cy="70" r={R} fill="none"
        stroke={d.color} strokeWidth={on ? 19 : 15} strokeLinecap="round"
        strokeDasharray={`${seg} ${C - seg}`} strokeDashoffset={-offset}
        style={{ opacity: hover === null || on ? 1 : 0.45, transition: "stroke-width .2s, opacity .2s", cursor: "pointer" }}
        onMouseEnter={() => setHover(i)}
        onMouseLeave={() => setHover(null)}
      />
    ) : null;
    offset += len;
    return node;
  });

  const h = hover !== null ? data[hover] : null;
  const pctH = h && sum > 0 ? Math.round((h.value / sum) * 100) : null;

  return (
    <div className="flex items-center gap-5">
      <div className="relative shrink-0">
        <svg viewBox="0 0 140 140" className="h-[132px] w-[132px] -rotate-90">
          <circle cx="70" cy="70" r={R} fill="none" stroke="color-mix(in srgb,var(--ink) 8%,transparent)" strokeWidth="15" />
          {segs}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-num text-2xl font-semibold" style={{ color: h ? h.color : "var(--ink)" }}>{h ? h.value : sum}</span>
          <span className="text-[0.6rem] uppercase tracking-[0.1em] text-faint">{h ? `${h.label} · ${pctH}%` : "total"}</span>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        {data.map((d, i) => (
          <div
            key={d.label}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
            className="flex cursor-default items-center gap-2 text-[0.8rem] transition-opacity"
            style={{ opacity: hover === null || hover === i ? 1 : 0.5 }}
          >
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: d.color }} />
            <span className="text-muted">{d.label}</span>
            <span className="ml-auto pl-3 font-num font-semibold text-ink">{d.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Répartition : une barre segmentée « parties d'un tout » (ex. pôles), avec
//    séparateurs 2px de la surface et légende directe. ──
export function Repartition({ data, money }: { data: { label: string; value: number; color: string }[]; money?: boolean }) {
  const [hover, setHover] = useState<number | null>(null);
  const sum = data.reduce((a, d) => a + d.value, 0);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex h-3.5 w-full overflow-hidden rounded-full" style={{ background: "color-mix(in srgb,var(--ink) 8%,transparent)", gap: "2px" }}>
        {data.map((d, i) => {
          const pct = sum > 0 ? (d.value / sum) * 100 : 0;
          if (pct <= 0) return null;
          return (
            <div
              key={d.label}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              className="h-full transition-opacity"
              style={{ width: `${pct}%`, background: d.color, opacity: hover === null || hover === i ? 1 : 0.5 }}
              title={`${d.label} : ${fmt(d.value, money)}`}
            />
          );
        })}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        {data.map((d, i) => (
          <div
            key={d.label}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
            className="flex items-center gap-1.5 text-[0.78rem] transition-opacity"
            style={{ opacity: hover === null || hover === i ? 1 : 0.5 }}
          >
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: d.color }} />
            <span className="text-muted">{d.label}</span>
            <span className="font-num font-semibold text-ink">{fmt(d.value, money)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
