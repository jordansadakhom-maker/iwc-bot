"use client";

import { Check, FileText, Wallet, Eye, TrendingUp, TrendingDown } from "lucide-react";
import clsx from "clsx";
import { KPIS, TRESORERIE, ATTENTION, OPERATIONS, NOTIFS, type Severity } from "@/lib/data";

const nf = new Intl.NumberFormat("fr-FR");

function Card({ children, className, delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  return (
    <section
      className={clsx("rounded-card border border-border bg-surface p-[18px] shadow-card animate-rise", className)}
      style={{ animationDelay: `${delay}s`, background: "linear-gradient(180deg,var(--surface),color-mix(in srgb,var(--surface) 88%,#000))" }}
    >
      {children}
    </section>
  );
}

function Sparkline({ points }: { points: readonly number[] }) {
  const w = 78, h = 30, pad = 3;
  const mn = Math.min(...points), mx = Math.max(...points), rg = mx - mn || 1;
  const x = (i: number) => pad + (i * (w - 2 * pad)) / (points.length - 1);
  const y = (v: number) => h - pad - ((v - mn) / rg) * (h - 2 * pad);
  const d = points.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  const up = points[points.length - 1] >= points[0];
  const c = up ? "var(--good)" : "var(--crit)";
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-[30px] w-[78px]" aria-hidden>
      <path d={d} fill="none" stroke={c} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={x(points.length - 1)} cy={y(points[points.length - 1])} r={2.2} fill={c} />
    </svg>
  );
}

const KPI_ICONS = [Wallet, Eye, FileText, TrendingUp];

function Kpis() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {KPIS.map((k, i) => {
        const Icon = KPI_ICONS[i] ?? Wallet;
        const delta = "delta" in k ? k.delta : undefined;
        return (
          <Card key={k.key} delay={0.02 + i * 0.06}>
            <div className="flex items-center justify-between">
              <span className="text-[0.72rem] font-semibold uppercase tracking-[0.09em] text-muted">{k.label}</span>
              <span className="grid h-[30px] w-[30px] place-items-center rounded-[9px] text-accent" style={{ background: "color-mix(in srgb,var(--accent) 15%,transparent)" }}>
                <Icon className="h-4 w-4" strokeWidth={1.8} />
              </span>
            </div>
            <div className="tabular mb-1 mt-3 font-num text-[1.9rem] font-semibold">
              {"prefix" in k && k.prefix}{nf.format(k.value)}
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className={clsx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.74rem] font-bold", k.up ? "text-good" : "text-crit")}
                style={{ background: k.up ? "color-mix(in srgb,var(--good) 15%,transparent)" : "color-mix(in srgb,var(--crit) 15%,transparent)" }}>
                {k.up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                {delta !== undefined ? `${delta} %` : ("note" in k ? k.note : "")}
              </span>
              <Sparkline points={k.spark} />
            </div>
          </Card>
        );
      })}
    </div>
  );
}

function Tresorerie() {
  // Courbe d'aire en SVG « fait main » : rendu identique partout, sans dépendance
  // ni mesure asynchrone. Les charts riches (Finances) utiliseront Recharts en Phase 2.
  const data = TRESORERIE.map((d) => d.solde);
  const W = 760, H = 230, pl = 8, pr = 8, pt = 14, pb = 22;
  const n = data.length;
  const mn = Math.min(...data) - 2, mx = Math.max(...data) + 2, rg = mx - mn || 1;
  const X = (i: number) => pl + (i * (W - pl - pr)) / (n - 1);
  const Y = (v: number) => pt + (1 - (v - mn) / rg) * (H - pt - pb);
  const line = data.map((v, i) => `${i ? "L" : "M"}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`).join(" ");
  const area = `${line} L ${X(n - 1).toFixed(1)} ${H - pb} L ${X(0).toFixed(1)} ${H - pb} Z`;
  const gy = (g: number) => pt + (g * (H - pt - pb)) / 3;
  const ex = X(n - 1), ey = Y(data[n - 1]);
  return (
    <Card delay={0.16}>
      <div className="mb-3.5 flex flex-wrap items-center justify-between gap-2.5">
        <h3 className="text-[0.8rem] font-semibold uppercase tracking-[0.06em] text-muted">Trésorerie — 30 derniers jours</h3>
        <div className="flex flex-wrap gap-4 text-[0.75rem] text-muted">
          <b className="inline-flex items-center gap-1.5 font-medium"><span className="h-2.5 w-2.5 rounded" style={{ background: "var(--good)" }} />Entrées</b>
          <b className="inline-flex items-center gap-1.5 font-medium"><span className="h-2.5 w-2.5 rounded" style={{ background: "var(--crit)" }} />Sorties</b>
          <b className="inline-flex items-center gap-1.5 font-medium"><span className="h-2.5 w-2.5 rounded" style={{ background: "var(--accent)" }} />Solde</b>
        </div>
      </div>
      <div className="w-full overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-[230px] w-full min-w-[520px]" aria-label="Courbe de trésorerie sur 30 jours">
          <defs>
            <linearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="var(--accent)" stopOpacity={0.34} />
              <stop offset="1" stopColor="var(--accent)" stopOpacity={0} />
            </linearGradient>
          </defs>
          {[0, 1, 2, 3].map((g) => (
            <line key={g} x1={pl} y1={gy(g)} x2={W - pr} y2={gy(g)} stroke="var(--border)" strokeWidth={1} strokeDasharray="2 5" />
          ))}
          <path d={area} fill="url(#fill)" />
          <path d={line} fill="none" stroke="var(--accent)" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
          <circle cx={ex} cy={ey} r={4.5} fill="var(--accent)" />
          <circle cx={ex} cy={ey} r={8} fill="none" stroke="var(--accent)" strokeWidth={1.4} opacity={0.4} />
        </svg>
      </div>
    </Card>
  );
}

const SEV_LABEL: Record<Severity, string> = { crit: "text-crit", warn: "text-warn", info: "text-steel" };
const SEV_BG: Record<Severity, string> = {
  crit: "color-mix(in srgb,var(--crit) 14%,transparent)",
  warn: "color-mix(in srgb,var(--warn) 14%,transparent)",
  info: "color-mix(in srgb,var(--steel) 14%,transparent)",
};
const SEV_STRIPE: Record<Severity, string> = { crit: "var(--crit)", warn: "var(--warn)", info: "var(--steel)" };

function Attention() {
  return (
    <Card delay={0.22}>
      <div className="mb-3.5 flex items-center justify-between">
        <h3 className="text-[0.8rem] font-semibold uppercase tracking-[0.06em] text-muted">Ce qui demande ton attention</h3>
        <span className="cursor-pointer text-[0.74rem] text-accent">Tout voir</span>
      </div>
      <div className="flex flex-col">
        {ATTENTION.map((a, i) => (
          <div key={i} className={clsx("flex cursor-pointer items-start gap-3 rounded-[10px] px-2 py-3 hover:bg-[color-mix(in_srgb,var(--ink)_5%,transparent)]", i > 0 && "border-t border-border")}>
            <span className="w-[3px] shrink-0 self-stretch rounded" style={{ background: SEV_STRIPE[a.sev] }} />
            <div>
              <div className="text-[0.85rem] font-medium">{a.titre}</div>
              <div className="mt-0.5 text-[0.75rem] text-muted">{a.detail}</div>
            </div>
            <span className={clsx("ml-auto self-center whitespace-nowrap rounded-full px-2 py-[3px] text-[0.64rem] font-bold uppercase tracking-[0.04em]", SEV_LABEL[a.sev])} style={{ background: SEV_BG[a.sev] }}>
              {a.tag}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}

function Avatars({ list }: { list: string[] }) {
  return (
    <span className="flex">
      {list.map((m, i) => (
        <i key={i} className="-ml-1.5 grid h-[19px] w-[19px] place-items-center rounded-full border-2 border-surface-2 text-[0.56rem] font-extrabold not-italic text-black/85" style={{ background: i === 1 ? "var(--steel)" : i === 2 ? "var(--oxblood)" : "var(--brass)", color: i >= 1 ? "#fff" : undefined }}>
          {m}
        </i>
      ))}
    </span>
  );
}

function KCard({ titre, type, etape, membres, tone }: { titre: string; type: string; etape: string; membres: string[]; tone?: "good" | "muted" }) {
  const tagStyle = tone === "good"
    ? { background: "color-mix(in srgb,var(--good) 18%,transparent)", color: "var(--good)" }
    : tone === "muted"
      ? { background: "color-mix(in srgb,var(--faint) 20%,transparent)", color: "var(--muted)" }
      : { background: "color-mix(in srgb,var(--accent) 16%,transparent)", color: "var(--accent)" };
  return (
    <div className="mb-2.5 cursor-pointer rounded-[11px] border border-border bg-surface-2 px-3 py-2.5 transition hover:-translate-y-0.5 hover:border-border-2">
      <div className="text-[0.83rem] font-semibold">{titre}</div>
      <div className="mt-2 flex items-center gap-2 text-[0.7rem] text-muted">
        <span className="rounded-md px-1.5 py-0.5 text-[0.62rem] font-bold" style={tagStyle}>{type}</span>
        <span>{etape}</span>
        {membres.length ? <Avatars list={membres} /> : null}
      </div>
    </div>
  );
}

function OpsBoard() {
  return (
    <Card delay={0.24}>
      <div className="mb-3.5 flex items-center justify-between">
        <h3 className="text-[0.8rem] font-semibold uppercase tracking-[0.06em] text-muted">Opérations en cours</h3>
        <span className="cursor-pointer text-[0.74rem] text-accent">Ouvrir le tableau</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <div className="mb-2.5 flex items-center gap-2 text-[0.72rem] uppercase tracking-[0.08em] text-muted">Préparation <span className="ml-auto font-num text-faint">2</span></div>
          {OPERATIONS.preparation.map((o) => <KCard key={o.titre} {...o} />)}
        </div>
        <div>
          <div className="mb-2.5 flex items-center gap-2 text-[0.72rem] uppercase tracking-[0.08em] text-muted">En cours <span className="ml-auto font-num text-faint">1</span></div>
          {OPERATIONS.encours.map((o) => <KCard key={o.titre} {...o} tone="good" />)}
        </div>
        <div>
          <div className="mb-2.5 flex items-center gap-2 text-[0.72rem] uppercase tracking-[0.08em] text-muted">Terminées <span className="ml-auto font-num text-faint">1</span></div>
          {OPERATIONS.terminees.map((o) => <KCard key={o.titre} {...o} tone="muted" />)}
        </div>
      </div>
    </Card>
  );
}

function NotifFeed() {
  return (
    <Card delay={0.28}>
      <div className="mb-3.5 flex items-center justify-between">
        <h3 className="text-[0.8rem] font-semibold uppercase tracking-[0.06em] text-muted">Notifications récentes</h3>
        <span className="cursor-pointer text-[0.74rem] text-accent">Centre</span>
      </div>
      <div className="flex flex-col">
        {NOTIFS.map((n, i) => (
          <div key={i} className={clsx("flex items-start gap-2.5 py-2.5", i > 0 && "border-t border-border")}>
            <span className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-[9px] bg-surface-2 text-muted">
              <Check className="h-[15px] w-[15px]" strokeWidth={1.8} />
            </span>
            <div>
              <div className="text-[0.82rem] leading-snug">{n.titre}</div>
              <div className="mt-0.5 flex items-center gap-2 text-[0.71rem] text-faint">
                <span className="rounded border border-border-2 px-1.5 py-0.5 text-[0.6rem] font-bold uppercase tracking-[0.05em] text-muted">{n.tag}</span>
                {n.quand}
              </div>
            </div>
            {n.unread ? <span className="ml-auto mt-1.5 h-[7px] w-[7px] shrink-0 rounded-full bg-accent" /> : null}
          </div>
        ))}
      </div>
    </Card>
  );
}

export function Dashboard() {
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[1.9rem] tracking-[0.01em]" style={{ textWrap: "balance" } as React.CSSProperties}>Tableau de bord</h1>
          <div className="mt-1 text-[0.85rem] text-muted">Jeudi 18 juillet 1904 — vue <b className="text-accent">de la maison</b></div>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 text-[0.72rem] text-muted">
          <span className="h-2 w-2 rounded-full bg-good" /> Données en direct
        </span>
      </div>

      <Kpis />

      <div className="grid items-start gap-4 lg:grid-cols-[2fr_1fr]">
        <Tresorerie />
        <Attention />
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[2fr_1fr]">
        <OpsBoard />
        <NotifFeed />
      </div>
    </>
  );
}
