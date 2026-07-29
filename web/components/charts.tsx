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

// ── Évolution de la trésorerie — courbe multi-lignes dans le temps, dans le
//    style de la « finance de l'armurerie » : aire sous le total, lignes par
//    coffre, grille + axes en $, infobulle datée au survol. Nourrie par les
//    événements « coffre.ajuste » (voir getTresorerieEvolution). ──
type TP = { t: number; commun: number; legal: number; illegal: number; total: number };

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  const nice = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return nice * p;
}
const dJour = (t: number) => new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short" }).format(new Date(t));
const dHeure = (t: number) => new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(new Date(t));

export function TresorerieChart({ points }: { points: TP[] }) {
  const [hover, setHover] = useState<number | null>(null);
  if (!points || points.length < 2) {
    return (
      <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
        <p className="max-w-md font-display text-[0.92rem] italic leading-relaxed text-muted">La courbe se construit à mesure des dépôts et retraits sur les coffres. Fais un ajustement pour l&apos;alimenter.</p>
        <span className="text-[0.66rem] uppercase tracking-[0.22em] text-faint">— Trésorerie en sommeil —</span>
      </div>
    );
  }

  const W = 760, H = 250, PL = 56, PR = 60, PT = 16, PB = 26;
  const pw = W - PL - PR, ph = H - PT - PB;
  const n = points.length;
  const series = [
    { key: "commun" as const, label: "Commun", color: "#c98500", width: 1.6, dash: "" },
    { key: "legal" as const, label: "Iron Wolf", color: "#3987e5", width: 1.6, dash: "5 3" },
    { key: "illegal" as const, label: "Confrérie", color: "#e66767", width: 1.6, dash: "1.5 3.5" },
  ];
  const rawMax = Math.max(...points.flatMap((p) => [p.total, p.commun, p.legal, p.illegal]), 1);
  const ymax = niceMax(rawMax);
  const span = ymax || 1;
  const x = (i: number) => PL + (n === 1 ? pw / 2 : (i / (n - 1)) * pw);
  const y = (v: number) => PT + (1 - v / span) * ph;
  const path = (get: (p: TP) => number) => points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(get(p)).toFixed(1)}`).join(" ");
  const totalPath = path((p) => p.total);
  const areaPath = `${totalPath} L${x(n - 1).toFixed(1)},${y(0).toFixed(1)} L${x(0).toFixed(1)},${y(0).toFixed(1)} Z`;
  const last = points[n - 1];
  const hp = hover != null ? points[hover] : null;

  return (
    <div className="relative">
      <div className="mb-2 flex flex-wrap items-center justify-end gap-3 text-[0.68rem] text-faint">
        <span className="mr-auto text-[0.72rem] font-semibold uppercase tracking-[0.06em] text-muted">Évolution de la trésorerie</span>
        <span className="inline-flex items-center gap-1"><span className="inline-block h-1.5 w-3 rounded-sm" style={{ background: "var(--brass-hi)" }} /> Total</span>
        {series.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1"><span className="inline-block h-0 w-3 border-t-2" style={{ borderColor: s.color, borderStyle: s.dash ? "dashed" : "solid" }} /> {s.label}</span>
        ))}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full select-none" style={{ height: "auto" }}
        onMouseMove={(e) => { const rect = e.currentTarget.getBoundingClientRect(); const vbX = ((e.clientX - rect.left) / rect.width) * W; const i = Math.round(((vbX - PL) / pw) * (n - 1)); setHover(Math.max(0, Math.min(n - 1, i))); }}
        onMouseLeave={() => setHover(null)}>
        <defs>
          <linearGradient id="treso-aire" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--brass-hi)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--brass-hi)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 0.25, 0.5, 0.75, 1].map((g) => { const yy = PT + g * ph; return (
          <g key={g}>
            <line x1={PL} y1={yy} x2={W - PR} y2={yy} stroke="var(--border)" strokeWidth={1} />
            <text x={PL - 6} y={yy + 3} textAnchor="end" fontSize={9} fill="var(--faint)">{cents(ymax - g * span)}$</text>
          </g>
        ); })}
        <path d={areaPath} fill="url(#treso-aire)" />
        {series.map((s) => (
          <path key={s.key} d={path((p) => p[s.key])} fill="none" stroke={s.color} strokeWidth={s.width} strokeDasharray={s.dash || undefined} strokeLinejoin="round" strokeLinecap="round" opacity={0.9} />
        ))}
        <path d={totalPath} fill="none" stroke="var(--brass-hi)" strokeWidth={2.6} strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={x(n - 1)} cy={y(last.total)} r={3} fill="var(--brass-hi)" />
        <text x={W - PR + 4} y={y(last.total) + 3} fontSize={9.5} fill="var(--brass-hi)" className="font-semibold">{cents(last.total)}$</text>
        <text x={PL} y={H - 7} textAnchor="start" fontSize={9} fill="var(--faint)">{dJour(points[0].t)}</text>
        <text x={W - PR} y={H - 7} textAnchor="end" fontSize={9} fill="var(--faint)">{dJour(last.t)}</text>
        {hp ? (
          <g>
            <line x1={x(hover!)} y1={PT} x2={x(hover!)} y2={PT + ph} stroke="var(--muted)" strokeWidth={1} opacity={0.5} />
            <circle cx={x(hover!)} cy={y(hp.total)} r={3.5} fill="var(--brass-hi)" stroke="var(--surface)" strokeWidth={1.5} />
          </g>
        ) : null}
      </svg>
      {hp ? (
        <div className="pointer-events-none absolute z-10 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[0.68rem] shadow-lg" style={{ left: `${(x(hover!) / W) * 100}%`, top: 28, transform: `translateX(${hover! > n / 2 ? "-105%" : "5%"})` }}>
          <div className="mb-1 font-semibold text-muted">{dJour(hp.t)} · {dHeure(hp.t)}</div>
          <div className="flex items-center justify-between gap-3"><span style={{ color: "#c98500" }}>Commun</span><span className="font-num">${cents(hp.commun)}</span></div>
          <div className="flex items-center justify-between gap-3"><span style={{ color: "#3987e5" }}>Iron Wolf</span><span className="font-num">${cents(hp.legal)}</span></div>
          <div className="flex items-center justify-between gap-3"><span style={{ color: "#e66767" }}>Confrérie</span><span className="font-num">${cents(hp.illegal)}</span></div>
          <div className="mt-1 flex items-center justify-between gap-3 border-t border-border pt-1"><span className="font-semibold">Total</span><span className="font-num font-semibold" style={{ color: "var(--brass-hi)" }}>${cents(hp.total)}</span></div>
        </div>
      ) : null}
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
