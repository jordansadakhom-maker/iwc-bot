"use client";

// Graphiques légers en SVG/CSS pur — fiables sous React 19 (aucune dépendance),
// thème clair/sombre via tokens, libellés directs + survol interactif.

import { useState } from "react";
import { cents } from "@/lib/format";

// ── Barres horizontales (magnitude, teinte laiton par défaut ; couleur/ligne
//    catégorielle possible). Survol : la barre s'illumine, sa valeur ressort. ──
function fmt(n: number, money?: boolean) {
  return money ? "$" + cents(n) : String(n);
}

export function BarresH({
  data,
  money,
  share,
}: {
  data: { label: string; value: number; color?: string }[];
  money?: boolean;
  // `share` : affiche en plus la part (%) de chaque barre dans le total. Optionnel
  // → n'affecte pas les autres usages du graphique (membres, statistiques…).
  share?: boolean;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.value));
  const sum = data.reduce((a, d) => a + d.value, 0);
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
              <span className="inline-flex min-w-0 items-center gap-1.5 truncate text-muted">
                {d.color ? <span className="h-2 w-2 shrink-0 rounded-[2px]" style={{ background: d.color }} /> : null}
                <span className="truncate">{d.label}</span>
              </span>
              <span className="shrink-0 font-num font-semibold text-ink" style={on ? { color: base } : undefined}>
                {fmt(d.value, money)}
                {share && sum > 0 ? <span className="ml-1.5 font-normal text-faint">· {Math.round((d.value / sum) * 100)}%</span> : null}
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

// ── Comparatif des coffres — version « immersive » quasi-3D. Chaque coffre est
//    un lingot métallique : rigole encaissée (groove), dégradé cylindrique
//    (lumière en haut, ombre en bas), arête de lumière, ombre portée + halo
//    coloré, et un reflet qui glisse lentement (comme la lumière sur du métal).
//    L'argent se lit en or. Dédié à la page Finances — BarresH reste inchangé
//    pour les autres graphes (membres, statistiques…). ──
export function ComparatifCoffres({ data }: { data: { label: string; value: number; color: string }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.value));
  const sum = data.reduce((a, d) => a + d.value, 0);
  return (
    <div className="flex flex-col gap-4 pt-1">
      {data.map((d, i) => {
        const pct = d.value > 0 ? Math.max((d.value / max) * 100, 3) : 0;
        const share = sum > 0 ? Math.round((d.value / sum) * 100) : 0;
        const on = hover === i;
        const c = d.color;
        return (
          <div
            key={d.label}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
            className="cursor-default transition-opacity"
            style={{ opacity: hover === null || on ? 1 : 0.55 }}
          >
            <div className="mb-1.5 flex items-baseline justify-between gap-2 text-[0.8rem]">
              <span className="inline-flex min-w-0 items-center gap-2 truncate text-muted">
                <span className="h-2.5 w-2.5 shrink-0 rotate-45 rounded-[2px]" style={{ background: c, boxShadow: `0 0 8px -1px ${c}` }} />
                <span className="truncate">{d.label}</span>
              </span>
              <span className="shrink-0 font-num text-[0.95rem] font-bold tabular-nums" style={{ color: "var(--brass-hi)", textShadow: "0 0 16px color-mix(in srgb, var(--brass-hi) 34%, transparent)" }}>
                ${cents(d.value)}
                {sum > 0 ? <span className="ml-1.5 text-[0.76rem] font-normal text-faint">· {share}%</span> : null}
              </span>
            </div>
            {/* Rigole encaissée : le lingot vient s'y loger, en relief. */}
            <div
              className="relative h-9 w-full rounded-full"
              style={{
                background: "linear-gradient(180deg, color-mix(in srgb,#000 34%,var(--surface-2)), color-mix(in srgb,#000 10%,var(--surface-2)))",
                boxShadow: "inset 0 2px 5px rgba(0,0,0,.55), inset 0 -1px 0 color-mix(in srgb,#fff 6%,transparent)",
              }}
            >
              {pct > 0 ? (
                <div
                  className="iwc-glint absolute inset-y-[3px] left-[3px] overflow-hidden rounded-full"
                  style={{
                    width: `calc(${pct}% - 6px)`,
                    minWidth: "22px",
                    animationDelay: `${i * 0.45}s`,
                    background: `linear-gradient(180deg, color-mix(in srgb,#fff 42%,transparent), transparent 46%, color-mix(in srgb,#000 30%,transparent)), linear-gradient(90deg, color-mix(in srgb,${c} 50%,#000), ${c})`,
                    boxShadow: `inset 0 1px 0 color-mix(in srgb,#fff 55%,transparent), inset 0 -2px 5px color-mix(in srgb,#000 42%,transparent), 0 3px 8px -2px rgba(0,0,0,.55), 0 0 ${on ? 26 : 15}px -6px ${c}`,
                    transition: "box-shadow .25s ease, width .55s cubic-bezier(.22,.61,.36,1)",
                  }}
                />
              ) : null}
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
