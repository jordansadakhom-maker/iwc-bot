import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

export function PageHeader({ titre, sous, action }: { titre: string; sous?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-3">
      <div className="min-w-0">
        <h1 className="font-display text-[1.6rem] font-semibold uppercase tracking-[0.02em] text-ink">{titre}</h1>
        {sous ? <p className="mt-0.5 text-[0.86rem] text-muted">{sous}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-card border border-border bg-surface p-4 shadow-card ${className}`}>{children}</div>;
}

export function StatTile({ icon: Icon, label, value, sous, tone = "navy" }: { icon: LucideIcon; label: string; value: string | number; sous?: string; tone?: "navy" | "good" | "warn" | "crit" | "gold" }) {
  const col = `var(--${tone})`;
  return (
    <div className="rounded-card border border-border bg-surface p-3.5 shadow-card">
      <div className="flex items-center gap-2 text-[0.68rem] uppercase tracking-[0.06em] text-muted">
        <Icon className="h-3.5 w-3.5" style={{ color: col }} /> {label}
      </div>
      <div className="mt-1.5 font-num text-[1.7rem] font-bold leading-none" style={{ color: col }}>{value}</div>
      {sous ? <div className="mt-1 text-[0.72rem] text-faint">{sous}</div> : null}
    </div>
  );
}

export function Banner({ tone = "warn", children }: { tone?: "warn" | "crit" | "good" | "navy"; children: ReactNode }) {
  const col = `var(--${tone})`;
  return (
    <div className="flex items-start gap-2 rounded-card border px-3.5 py-2.5 text-[0.84rem]"
      style={{ borderColor: `color-mix(in srgb,${col} 45%,var(--border))`, background: `color-mix(in srgb,${col} 9%,transparent)`, color: "var(--ink)" }}>
      {children}
    </div>
  );
}

export function EmptyState({ icon: Icon, titre, sous }: { icon: LucideIcon; titre: string; sous?: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-card border border-dashed border-border px-4 py-12 text-center">
      <Icon className="h-7 w-7 text-faint" strokeWidth={1.5} />
      <div className="font-display text-[1.05rem] uppercase tracking-[0.02em] text-ink">{titre}</div>
      {sous ? <p className="max-w-md text-[0.84rem] text-muted">{sous}</p> : null}
    </div>
  );
}

export function Pill({ children, tone = "muted" }: { children: ReactNode; tone?: string }) {
  const col = `var(--${tone})`;
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.64rem] font-semibold uppercase tracking-[0.04em]"
      style={{ color: col, background: `color-mix(in srgb,${col} 15%,transparent)` }}>
      {children}
    </span>
  );
}
