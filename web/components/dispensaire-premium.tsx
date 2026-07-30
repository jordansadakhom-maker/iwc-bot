"use client";

import { useEffect, useRef, useState, type ReactNode, type ElementType } from "react";
import Link from "next/link";
import { ArrowUpRight, TrendingUp, TrendingDown, type LucideIcon } from "lucide-react";

// Primitives présentationnelles PREMIUM, propres au Dispensaire (aucun partage
// avec edit-ui/ui.tsx). Tout est thémé par les jetons .disp-premium (bleu médical
// + verre) → cohérence automatique. CSS/RAF uniquement, zéro dépendance.

type Tone = "accent" | "good" | "warn" | "crit" | "steel";
const toneCol = (t?: Tone) => t === "good" ? "var(--good)" : t === "warn" ? "var(--warn)" : t === "crit" ? "var(--crit)" : t === "steel" ? "var(--steel)" : "var(--accent)";

// ── PremiumCard — carte (verre optionnel) + rail de lumière + élévation ──────
export function PremiumCard({ children, className = "", tone, glass = false, lift = true, as: Tag = "div", style }: { children: ReactNode; className?: string; tone?: Tone; glass?: boolean; lift?: boolean; as?: ElementType; style?: React.CSSProperties }) {
  const col = toneCol(tone);
  const base = glass ? "disp-glass shadow-card" : "border border-border shadow-card";
  return (
    <Tag className={`relative overflow-hidden ${base} ${lift ? "disp-lift" : ""} ${className}`} style={{ borderRadius: "var(--r-lg)", ...(glass ? {} : { background: "var(--surface)" }), ...style }}>
      <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-px" style={{ background: `linear-gradient(90deg, transparent, color-mix(in srgb,${col} 60%,transparent), transparent)` }} />
      {children}
    </Tag>
  );
}

// ── AnimatedCounter — compteur count-up (respecte reduced-motion) ────────────
export function AnimatedCounter({ value, from = 0, duration = 400, format, className }: { value: number; from?: number; duration?: number; format?: (n: number) => string; className?: string }) {
  const fmt = format || ((n: number) => new Intl.NumberFormat("fr-FR").format(Math.round(n)));
  const [display, setDisplay] = useState(value);
  const prev = useRef(value);
  useEffect(() => {
    const reduce = typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const start = prev.current;
    prev.current = value;
    if (reduce || start === value) { setDisplay(value); return; }
    let raf = 0; const t0 = performance.now();
    const ease = (x: number) => 1 - Math.pow(1 - x, 3); // easeOutCubic
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / duration);
      setDisplay(start + (value - start) * ease(p));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return <span className={className} style={{ fontVariantNumeric: "tabular-nums" }}>{fmt(display)}</span>;
}

// ── StatWidget — KPI (compteur + icône + tendance + lien) ────────────────────
export function StatWidget({ label, value, format, tone, icon: Icon, sous, href, trend, live, glass }: { label: string; value: number; format?: (n: number) => string; tone?: Tone; icon?: LucideIcon; sous?: ReactNode; href?: string; trend?: { delta: number; favorable: boolean; libelle?: string }; live?: boolean; glass?: boolean }) {
  const col = toneCol(tone);
  const inner = (
    <div className="flex flex-col gap-1.5 p-3.5">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-[0.66rem] font-semibold uppercase tracking-[0.09em] text-faint">
          {Icon ? <Icon className="h-3.5 w-3.5" style={{ color: col }} /> : null}{label}
          {live ? <span className="disp-live-dot h-1.5 w-1.5 rounded-full" style={{ background: "var(--good)" }} /> : null}
        </span>
        {href ? <ArrowUpRight className="h-4 w-4 text-faint opacity-0 transition group-hover:translate-x-0.5 group-hover:opacity-100" /> : null}
      </div>
      <div className="flex items-end justify-between gap-2">
        <AnimatedCounter value={value} format={format} className="font-num text-[1.65rem] font-bold leading-none" />
        {trend ? (
          <span className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[0.66rem] font-bold" style={{ color: trend.favorable ? "var(--good)" : "var(--crit)", background: `color-mix(in srgb,${trend.favorable ? "var(--good)" : "var(--crit)"} 14%,transparent)` }}>
            {trend.favorable ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}{Math.abs(trend.delta)}{trend.libelle || "%"}
          </span>
        ) : null}
      </div>
      {sous ? <div className="truncate text-[0.72rem] text-faint">{sous}</div> : null}
    </div>
  );
  if (href) return <Link href={href} className="group block"><PremiumCard tone={tone} glass={glass}>{inner}</PremiumCard></Link>;
  return <PremiumCard tone={tone} glass={glass} lift={false}>{inner}</PremiumCard>;
}

// ── PriorityBadge — info / important / critique / urgence ────────────────────
const PRIO: Record<string, { col: string }> = {
  info: { col: "var(--steel)" }, important: { col: "var(--warn)" }, critique: { col: "var(--crit)" }, urgence: { col: "var(--crit)" }, succes: { col: "var(--good)" },
};
export function PriorityBadge({ tone, children, dot, pulse }: { tone: "info" | "important" | "critique" | "urgence" | "succes"; children: ReactNode; dot?: boolean; pulse?: boolean }) {
  const col = PRIO[tone]?.col || "var(--steel)";
  return (
    <span className={`inline-flex items-center gap-1 ${pulse || tone === "urgence" ? "disp-urgent" : ""}`} style={{ color: col, background: `color-mix(in srgb,${col} 14%,transparent)`, border: `1px solid color-mix(in srgb,${col} 32%,transparent)`, borderRadius: "var(--r-pill)", padding: "2px 9px", fontSize: "0.64rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>
      {dot ? <span className="h-1.5 w-1.5 rounded-full" style={{ background: col }} /> : null}{children}
    </span>
  );
}

// ── Skeleton — shimmer (réutilise .iwc-skeleton global) ──────────────────────
export function Skeleton({ w, h = 16, radius = "var(--r-md)", className = "" }: { w?: number | string; h?: number | string; radius?: string; className?: string }) {
  return <span className={`iwc-skeleton block ${className}`} style={{ width: w ?? "100%", height: h, borderRadius: radius, background: "var(--surface-2)" }} />;
}

// ── SectionHeader — en-tête de section premium ───────────────────────────────
export function SectionHeader({ eyebrow, titre, sous, icon: Icon, actions }: { eyebrow?: string; titre: string; sous?: string; icon?: LucideIcon; actions?: ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
      <div>
        {eyebrow ? <div className="text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-faint">{eyebrow}</div> : null}
        <h3 className="flex items-center gap-2 font-display text-[1.05rem] leading-tight text-ink">{Icon ? <Icon className="h-4 w-4 text-accent" /> : null}{titre}</h3>
        {sous ? <p className="mt-0.5 text-[0.78rem] text-muted">{sous}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-1.5">{actions}</div> : null}
    </div>
  );
}

// ── EmptyState — état vide premium ───────────────────────────────────────────
export function EmptyState({ titre, sous, icon: Icon, action }: { titre: string; sous?: string; icon?: LucideIcon; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-10 text-center" style={{ border: "1px dashed color-mix(in srgb,var(--accent) 24%,var(--border))", background: "color-mix(in srgb,var(--accent) 4%,transparent)", borderRadius: "var(--r-lg)" }}>
      {Icon ? <span className="grid h-14 w-14 place-items-center rounded-full border" style={{ borderColor: "color-mix(in srgb,var(--accent) 30%,var(--border))", background: "color-mix(in srgb,var(--accent) 8%,transparent)" }}><Icon className="h-6 w-6" style={{ color: "color-mix(in srgb,var(--accent) 75%,var(--faint))" }} strokeWidth={1.6} /></span> : null}
      <div>
        <p className="font-display text-[0.95rem] text-ink">{titre}</p>
        {sous ? <p className="mx-auto mt-1 max-w-sm text-[0.8rem] italic leading-relaxed text-faint">{sous}</p> : null}
      </div>
      {action}
    </div>
  );
}
