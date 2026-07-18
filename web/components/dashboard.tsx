"use client";

import { FileText, Wallet, Eye, TrendingUp, Plug, Inbox } from "lucide-react";
import clsx from "clsx";
import { KPIS, TRESORERIE, ATTENTION, OPERATIONS, NOTIFS, CONNECTE } from "@/lib/data";

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

function CardHeader({ titre, action }: { titre: string; action?: string }) {
  return (
    <div className="mb-3.5 flex items-center justify-between gap-2.5">
      <h3 className="text-[0.8rem] font-semibold uppercase tracking-[0.06em] text-muted">{titre}</h3>
      {action ? <span className="cursor-pointer text-[0.74rem] text-accent">{action}</span> : null}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
      <Inbox className="h-6 w-6 text-faint" strokeWidth={1.6} />
      <p className="max-w-sm text-[0.82rem] leading-relaxed text-muted">{children}</p>
    </div>
  );
}

// Bandeau honnête : tant que la base n'est pas branchée, aucune donnée n'est inventée.
function BandeauAttente() {
  if (CONNECTE) return null;
  return (
    <div className="flex items-start gap-3 rounded-card border border-border bg-surface p-3.5" style={{ borderColor: "color-mix(in srgb,var(--accent) 35%,var(--border))" }}>
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] text-accent" style={{ background: "color-mix(in srgb,var(--accent) 15%,transparent)" }}>
        <Plug className="h-[18px] w-[18px]" strokeWidth={1.8} />
      </span>
      <div className="text-[0.85rem] leading-relaxed">
        <b>Structure prête — en attente de tes vraies données.</b>
        <span className="text-muted"> Les coffres, contrats, opérations et transactions de ton Discord s'afficheront ici dès la connexion de la base (Phase 1). Aucun chiffre affiché n'est inventé.</span>
      </div>
    </div>
  );
}

const KPI_ICONS = [Wallet, Eye, FileText, TrendingUp];

function Kpis() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {KPIS.map((k, i) => {
        const Icon = KPI_ICONS[i] ?? Wallet;
        return (
          <Card key={k.key} delay={0.02 + i * 0.06}>
            <div className="flex items-center justify-between">
              <span className="text-[0.72rem] font-semibold uppercase tracking-[0.09em] text-muted">{k.label}</span>
              <span className="grid h-[30px] w-[30px] place-items-center rounded-[9px] text-accent" style={{ background: "color-mix(in srgb,var(--accent) 15%,transparent)" }}>
                <Icon className="h-4 w-4" strokeWidth={1.8} />
              </span>
            </div>
            <div className="tabular mb-1 mt-3 font-num text-[1.9rem] font-semibold text-faint">—</div>
            <div className="text-[0.72rem] text-faint">En attente de la base</div>
          </Card>
        );
      })}
    </div>
  );
}

function Tresorerie() {
  const data = TRESORERIE.map((d) => d.solde);
  return (
    <Card delay={0.16}>
      <CardHeader titre="Trésorerie — 30 derniers jours" />
      {data.length === 0 ? (
        <Empty>La courbe de trésorerie se construira à partir de tes vraies entrées et sorties (coffres légal &amp; illégal).</Empty>
      ) : (
        (() => {
          const W = 760, H = 230, pl = 8, pr = 8, pt = 14, pb = 22, n = data.length;
          const mn = Math.min(...data) - 2, mx = Math.max(...data) + 2, rg = mx - mn || 1;
          const X = (i: number) => pl + (i * (W - pl - pr)) / (n - 1);
          const Y = (v: number) => pt + (1 - (v - mn) / rg) * (H - pt - pb);
          const line = data.map((v, i) => `${i ? "L" : "M"}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`).join(" ");
          const area = `${line} L ${X(n - 1).toFixed(1)} ${H - pb} L ${X(0).toFixed(1)} ${H - pb} Z`;
          const gy = (g: number) => pt + (g * (H - pt - pb)) / 3;
          return (
            <div className="w-full overflow-x-auto">
              <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-[230px] w-full min-w-[520px]" aria-label="Courbe de trésorerie">
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
              </svg>
            </div>
          );
        })()
      )}
    </Card>
  );
}

const SEV_LABEL = { crit: "text-crit", warn: "text-warn", info: "text-steel" } as const;
const SEV_BG = {
  crit: "color-mix(in srgb,var(--crit) 14%,transparent)",
  warn: "color-mix(in srgb,var(--warn) 14%,transparent)",
  info: "color-mix(in srgb,var(--steel) 14%,transparent)",
} as const;
const SEV_STRIPE = { crit: "var(--crit)", warn: "var(--warn)", info: "var(--steel)" } as const;

function Attention() {
  return (
    <Card delay={0.22}>
      <CardHeader titre="Ce qui demande ton attention" action={ATTENTION.length ? "Tout voir" : undefined} />
      {ATTENTION.length === 0 ? (
        <Empty>Validations d'étapes, encaissements, demandes de RDV et candidatures remonteront ici automatiquement.</Empty>
      ) : (
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
      )}
    </Card>
  );
}

function OpsBoard() {
  const total = OPERATIONS.preparation.length + OPERATIONS.encours.length + OPERATIONS.terminees.length;
  return (
    <Card delay={0.24}>
      <CardHeader titre="Opérations en cours" action={total ? "Ouvrir le tableau" : undefined} />
      {total === 0 ? (
        <Empty>Les opérations se synchroniseront avec ton salon #operations : préparation par étapes, en cours, puis terminées.</Empty>
      ) : (
        <div className="grid gap-3 sm:grid-cols-3">
          {(["preparation", "encours", "terminees"] as const).map((col) => {
            const label = col === "preparation" ? "Préparation" : col === "encours" ? "En cours" : "Terminées";
            return (
              <div key={col}>
                <div className="mb-2.5 flex items-center gap-2 text-[0.72rem] uppercase tracking-[0.08em] text-muted">
                  {label} <span className="ml-auto font-num text-faint">{OPERATIONS[col].length}</span>
                </div>
                {OPERATIONS[col].map((o) => (
                  <div key={o.titre} className="mb-2.5 cursor-pointer rounded-[11px] border border-border bg-surface-2 px-3 py-2.5 transition hover:-translate-y-0.5 hover:border-border-2">
                    <div className="text-[0.83rem] font-semibold">{o.titre}</div>
                    <div className="mt-2 flex items-center gap-2 text-[0.7rem] text-muted">
                      <span className="rounded-md px-1.5 py-0.5 text-[0.62rem] font-bold" style={{ background: "color-mix(in srgb,var(--accent) 16%,transparent)", color: "var(--accent)" }}>{o.type}</span>
                      <span>{o.etape}</span>
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function NotifFeed() {
  return (
    <Card delay={0.28}>
      <CardHeader titre="Notifications récentes" action={NOTIFS.length ? "Centre" : undefined} />
      {NOTIFS.length === 0 ? (
        <Empty>Les notifications de ton Discord (validations, RDV, changements de statut…) arriveront ici en temps réel.</Empty>
      ) : (
        <div className="flex flex-col">
          {NOTIFS.map((n, i) => (
            <div key={i} className={clsx("flex items-start gap-2.5 py-2.5", i > 0 && "border-t border-border")}>
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
      )}
    </Card>
  );
}

export function Dashboard() {
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[1.9rem] tracking-[0.01em]" style={{ textWrap: "balance" } as React.CSSProperties}>Tableau de bord</h1>
          <div className="mt-1 text-[0.85rem] text-muted">Vue d&apos;ensemble de la maison</div>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 text-[0.72rem] text-muted">
          <span className="h-2 w-2 rounded-full" style={{ background: CONNECTE ? "var(--good)" : "var(--faint)" }} />
          {CONNECTE ? "Données en direct" : "Base non connectée"}
        </span>
      </div>

      <BandeauAttente />
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
