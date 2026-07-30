"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Download, type LucideIcon } from "lucide-react";
import type { Barre } from "@/lib/dispensaire-stats";
import { PremiumCard, SectionHeader } from "@/components/dispensaire-premium";

// Graphiques PREMIUM en SVG maison — animés, interactifs (survol/tooltip),
// exportables (CSV), responsives. Zéro dépendance.

function exportCSV(nom: string, data: Barre[]) {
  const rows = [["Libellé", "Valeur"], ...data.map((d) => [d.label, String(d.valeur)])];
  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a"); a.href = url; a.download = `${nom}.csv`; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// Carte de graphique premium : en-tête + bouton export.
export function ChartCard({ titre, icon, data, exportName, children }: { titre: string; icon?: LucideIcon; data?: Barre[]; exportName?: string; children: ReactNode }) {
  return (
    <PremiumCard lift={false} className="p-4">
      <SectionHeader titre={titre} icon={icon} actions={data && data.length ? (
        <button onClick={() => exportCSV(exportName || titre, data)} className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface-2 px-2 py-1 text-[0.7rem] font-semibold text-muted transition hover:text-ink" title="Exporter en CSV"><Download className="h-3.5 w-3.5" /> CSV</button>
      ) : undefined} />
      {children}
    </PremiumCard>
  );
}

// Courbe (aire) interactive : aplat dégradé, filets, survol → point + infobulle.
export function AreaChart({ data, hue = "var(--accent)", fmt, id }: { data: Barre[]; hue?: string; fmt?: (n: number) => string; id: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 100, H = 40, n = data.length;
  if (!n) return <p className="py-8 text-center text-[0.8rem] italic text-faint">Aucune donnée.</p>;
  const max = Math.max(1, ...data.map((d) => d.valeur));
  const pts = data.map((d, i) => [n > 1 ? (i / (n - 1)) * W : W / 2, H - 2 - (d.valeur / max) * (H - 6)] as const);
  const line = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
  const area = `M${pts[0][0].toFixed(1)} ${H} ` + pts.map((p) => "L" + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ") + ` L${pts[n - 1][0].toFixed(1)} ${H} Z`;
  const show = hover != null ? data[hover] : null;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="relative disp-rise" style={{ height: 128 }}>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="128" preserveAspectRatio="none" style={{ display: "block", overflow: "visible" }}>
          <defs><linearGradient id={`cg-${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={hue} stopOpacity="0.24" /><stop offset="1" stopColor={hue} stopOpacity="0" /></linearGradient></defs>
          {[10, 20, 30].map((y) => <line key={y} x1="0" y1={y} x2={W} y2={y} stroke="color-mix(in srgb,var(--ink) 8%,transparent)" strokeWidth="1" vectorEffect="non-scaling-stroke" />)}
          <path d={area} fill={`url(#cg-${id})`} />
          <path d={line} fill="none" stroke={hue} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          {show ? (<><line x1={pts[hover!][0]} y1="0" x2={pts[hover!][0]} y2={H} stroke={hue} strokeWidth="1" strokeOpacity="0.4" vectorEffect="non-scaling-stroke" /><circle cx={pts[hover!][0]} cy={pts[hover!][1]} r="2.4" fill={hue} stroke="var(--surface)" strokeWidth="1" vectorEffect="non-scaling-stroke" /></>) : null}
        </svg>
        {/* zones de survol (une par point) */}
        <div className="absolute inset-0 flex">
          {data.map((d, i) => <div key={i} className="h-full flex-1" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover((h) => (h === i ? null : h))} title={`${d.label} : ${d.libelle ?? (fmt ? fmt(d.valeur) : d.valeur)}`} />)}
        </div>
        {show ? (
          <div className="pointer-events-none absolute -top-1 left-1/2 -translate-x-1/2 rounded-lg border border-border bg-surface px-2 py-1 text-[0.7rem] shadow-card" style={{ left: `${(pts[hover!][0] / W) * 100}%` }}>
            <span className="text-faint">{show.label} · </span><b className="font-num" style={{ color: hue }}>{show.libelle ?? (fmt ? fmt(show.valeur) : show.valeur)}</b>
          </div>
        ) : null}
      </div>
      <div className="flex justify-between text-[0.6rem] text-faint"><span>{data[0]?.label}</span><span className="font-num">crête {fmt ? fmt(max) : max}</span><span>{data[n - 1]?.label}</span></div>
    </div>
  );
}

// Barres horizontales animées (classements).
export function BarsH({ data, hue = "var(--accent)", fmt }: { data: Barre[]; hue?: string; fmt?: (n: number) => string }) {
  const [on, setOn] = useState(false);
  useEffect(() => { const t = setTimeout(() => setOn(true), 30); return () => clearTimeout(t); }, []);
  const max = Math.max(1, ...data.map((d) => d.valeur));
  if (!data.length) return <p className="py-4 text-center text-[0.8rem] italic text-faint">Aucune donnée.</p>;
  return (
    <div className="flex flex-col gap-1.5">
      {data.map((d, i) => (
        <div key={i} className="flex items-center gap-2 text-[0.78rem]">
          <span className="w-28 shrink-0 truncate text-muted">{d.label}</span>
          <div className="h-3.5 flex-1 overflow-hidden rounded-full" style={{ background: "color-mix(in srgb,var(--ink) 8%,transparent)" }}>
            <div className="h-full rounded-full" style={{ width: on ? `${Math.max(3, Math.round((d.valeur / max) * 100))}%` : "0%", background: hue, transition: "width .6s cubic-bezier(.22,.61,.36,1)", transitionDelay: `${i * 45}ms` }} />
          </div>
          <span className="w-14 shrink-0 text-right font-num text-faint">{d.libelle ?? (fmt ? fmt(d.valeur) : d.valeur)}</span>
        </div>
      ))}
    </div>
  );
}

// Donut à 2 parts (ex. absences justifiées / injustifiées).
export function Donut({ a, b, colA = "var(--good)", colB = "var(--crit)", labelA, labelB }: { a: number; b: number; colA?: string; colB?: string; labelA: string; labelB: string }) {
  const total = Math.max(1, a + b);
  const r = 15.9155, c = 2 * Math.PI * r;
  const pa = (a / total) * c;
  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 40 40" width="96" height="96" className="disp-rise -rotate-90">
        <circle cx="20" cy="20" r={r} fill="none" stroke="color-mix(in srgb,var(--ink) 8%,transparent)" strokeWidth="5" />
        <circle cx="20" cy="20" r={r} fill="none" stroke={colB} strokeWidth="5" strokeDasharray={`${c} ${c}`} />
        <circle cx="20" cy="20" r={r} fill="none" stroke={colA} strokeWidth="5" strokeDasharray={`${pa} ${c}`} style={{ transition: "stroke-dasharray .7s cubic-bezier(.22,.61,.36,1)" }} />
        <text x="20" y="21" textAnchor="middle" className="rotate-90" style={{ transformOrigin: "center", fontSize: "8px", fontWeight: 700, fill: "var(--ink)" }}>{Math.round((a / total) * 100)}%</text>
      </svg>
      <div className="flex flex-col gap-1.5 text-[0.78rem]">
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: colA }} /> {labelA} <b className="font-num">{a}</b></span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: colB }} /> {labelB} <b className="font-num">{b}</b></span>
      </div>
    </div>
  );
}
