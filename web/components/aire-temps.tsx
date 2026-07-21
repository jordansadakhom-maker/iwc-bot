"use client";

import { useMemo, useState } from "react";

type Pt = { t: number; v: number };
const niceMax = (v: number) => { if (v <= 0) return 1; const p = Math.pow(10, Math.floor(Math.log10(v))); const n = v / p; const s = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10; return s * p; };
const money = (n: number) => n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "$";
const ent = (n: number) => Math.round(n).toLocaleString("fr-FR");
const dJour = (t: number) => new Date(t).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });

// Série temporelle (change-over-time). Une seule série → pas de légende, le titre
// nomme la mesure. Ligne 2px + aire, repère au survol, valeur de fin en direct.
export function AireTemps({ points, titre }: { points: Pt[]; titre: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const pts = useMemo(() => { const s = points.filter((p) => p.t).slice().sort((a, b) => a.t - b.t); if (!s.length) return []; return [{ t: s[0].t, v: 0 }, ...s]; }, [points]);

  if (pts.length < 2) return <div className="rounded-card border border-border bg-surface p-4 shadow-card"><div className="mb-1 text-[0.72rem] font-semibold uppercase tracking-[0.06em] text-muted">{titre}</div><p className="py-6 text-center text-[0.82rem] text-faint">Pas encore assez de mouvements pour tracer la courbe.</p></div>;

  const W = 760, H = 220, PL = 58, PR = 46, PT = 14, PB = 24; const pw = W - PL - PR, ph = H - PT - PB; const n = pts.length;
  const rawMax = Math.max(...pts.map((p) => p.v), 1); const rawMin = Math.min(...pts.map((p) => p.v), 0);
  const ymax = niceMax(rawMax); const ymin = rawMin < 0 ? -niceMax(-rawMin) : 0; const span = ymax - ymin || 1;
  const x = (i: number) => PL + (i / (n - 1)) * pw; const y = (v: number) => PT + (1 - (v - ymin) / span) * ph;
  const path = pts.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");
  const base = Math.max(0, ymin);
  const area = `${path} L${x(n - 1).toFixed(1)},${y(base).toFixed(1)} L${x(0).toFixed(1)},${y(base).toFixed(1)} Z`;
  const last = pts[n - 1]; const hp = hover != null ? pts[hover] : null;

  return (
    <div className="relative rounded-card border border-border bg-surface p-4 shadow-card">
      <div className="mb-1 text-[0.72rem] font-semibold uppercase tracking-[0.06em] text-muted">{titre}</div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full select-none" style={{ height: "auto" }}
        onMouseMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); const vx = ((e.clientX - r.left) / r.width) * W; const i = Math.round(((vx - PL) / pw) * (n - 1)); setHover(Math.max(0, Math.min(n - 1, i))); }}
        onMouseLeave={() => setHover(null)}>
        {[0, 0.25, 0.5, 0.75, 1].map((g) => { const yy = PT + g * ph; return <g key={g}><line x1={PL} y1={yy} x2={W - PR} y2={yy} stroke="var(--border)" strokeWidth={1} /><text x={PL - 6} y={yy + 3} textAnchor="end" fontSize={9} fill="var(--faint)">{ent(ymax - g * span)}$</text></g>; })}
        {ymin < 0 ? <line x1={PL} y1={y(0)} x2={W - PR} y2={y(0)} stroke="var(--muted)" strokeWidth={1} opacity={0.5} /> : null}
        <path d={area} fill="var(--accent)" opacity={0.12} />
        <path d={path} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={x(n - 1)} cy={y(last.v)} r={3} fill="var(--accent)" />
        <text x={W - PR + 4} y={y(last.v) + 3} fontSize={10} fill="var(--accent)" className="font-semibold">{ent(last.v)}</text>
        <text x={PL} y={H - 6} textAnchor="start" fontSize={9} fill="var(--faint)">{dJour(pts[0].t)}</text>
        <text x={W - PR} y={H - 6} textAnchor="end" fontSize={9} fill="var(--faint)">{dJour(last.t)}</text>
        {hp ? <g><line x1={x(hover!)} y1={PT} x2={x(hover!)} y2={PT + ph} stroke="var(--muted)" strokeWidth={1} opacity={0.5} /><circle cx={x(hover!)} cy={y(hp.v)} r={3.5} fill="var(--accent)" stroke="var(--surface)" strokeWidth={1.5} /></g> : null}
      </svg>
      {hp ? <div className="pointer-events-none absolute z-10 rounded-lg border border-border bg-surface px-2 py-1 text-[0.7rem] shadow-lg" style={{ left: `${(x(hover!) / W) * 100}%`, top: 26, transform: `translateX(${hover! > n / 2 ? "-105%" : "5%"})` }}><div className="font-semibold text-muted">{dJour(hp.t)}</div><div className="font-num" style={{ color: "var(--accent)" }}>{money(hp.v)}</div></div> : null}
    </div>
  );
}
