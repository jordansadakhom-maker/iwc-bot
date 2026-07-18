import { Inbox, type LucideIcon } from "lucide-react";
import clsx from "clsx";

// Primitives d'interface partagées par les pages (serveur-compatibles, sans hooks).

export function PoleChip({ pole }: { pole: "iwc" | "confrerie" }) {
  const conf = pole === "confrerie";
  const c = conf ? "var(--oxblood)" : "var(--brass)";
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.7rem] font-semibold"
      style={{ color: c, borderColor: "color-mix(in srgb," + c + " 45%,var(--border))", background: "color-mix(in srgb," + c + " 10%,transparent)" }}
    >
      <span>{conf ? "🔪" : "⚖️"}</span>
      {conf ? "La Confrérie" : "Iron Wolf"}
    </span>
  );
}

export function PageHeader({ titre, sous, actif, pole }: { titre: string; sous?: string; actif?: boolean; pole?: "iwc" | "confrerie" }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-[1.9rem] tracking-[0.01em]">{titre}</h1>
        {sous ? <div className="mt-1 text-[0.85rem] text-muted">{sous}</div> : null}
      </div>
      <div className="flex items-center gap-2">
        {pole ? <PoleChip pole={pole} /> : null}
        <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 text-[0.72rem] text-muted">
          <span className="h-2 w-2 rounded-full" style={{ background: actif ? "var(--good)" : "var(--faint)" }} />
          {actif ? "Données en direct" : "En attente de la base"}
        </span>
      </div>
    </div>
  );
}

export function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <section
      className={clsx("rounded-card border border-border bg-surface p-[18px] shadow-card", className)}
      style={{ background: "linear-gradient(180deg,var(--surface),color-mix(in srgb,var(--surface) 88%,#000))" }}
    >
      {children}
    </section>
  );
}

export function CardHeader({ titre, compteur }: { titre: string; compteur?: number | string }) {
  return (
    <div className="mb-3.5 flex items-center justify-between gap-2.5">
      <h3 className="text-[0.8rem] font-semibold uppercase tracking-[0.06em] text-muted">{titre}</h3>
      {compteur !== undefined ? <span className="font-num text-[0.8rem] text-faint">{compteur}</span> : null}
    </div>
  );
}

export function Empty({ icon: Icon = Inbox, children }: { icon?: LucideIcon; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
      <Icon className="h-6 w-6 text-faint" strokeWidth={1.6} />
      <p className="max-w-md text-[0.82rem] leading-relaxed text-muted">{children}</p>
    </div>
  );
}

export function Badge({ children, tone = "accent" }: { children: React.ReactNode; tone?: "accent" | "good" | "warn" | "muted" | "oxblood" }) {
  const map = {
    accent: { c: "var(--accent)", b: "color-mix(in srgb,var(--accent) 16%,transparent)" },
    good: { c: "var(--good)", b: "color-mix(in srgb,var(--good) 16%,transparent)" },
    warn: { c: "var(--warn)", b: "color-mix(in srgb,var(--warn) 16%,transparent)" },
    muted: { c: "var(--muted)", b: "color-mix(in srgb,var(--ink) 8%,transparent)" },
    oxblood: { c: "var(--oxblood)", b: "color-mix(in srgb,var(--oxblood) 18%,transparent)" },
  }[tone];
  return (
    <span className="rounded-md px-1.5 py-0.5 text-[0.62rem] font-bold uppercase tracking-[0.04em]" style={{ color: map.c, background: map.b }}>
      {children}
    </span>
  );
}
