"use client";

import { FileText, Wallet, Landmark, Target, Plug, Inbox } from "lucide-react";
import clsx from "clsx";
import type { DashData } from "@/lib/queries";

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

function money(n: number | null): string {
  if (n === null || n === undefined) return "—";
  return "$" + n.toLocaleString("fr-FR");
}

// Bandeau honnête : tant que la base n'est pas branchée, aucune donnée n'est inventée.
function BandeauAttente({ connecte }: { connecte: boolean }) {
  if (connecte) return null;
  return (
    <div className="flex items-start gap-3 rounded-card border border-border bg-surface p-3.5" style={{ borderColor: "color-mix(in srgb,var(--accent) 35%,var(--border))" }}>
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] text-accent" style={{ background: "color-mix(in srgb,var(--accent) 15%,transparent)" }}>
        <Plug className="h-[18px] w-[18px]" strokeWidth={1.8} />
      </span>
      <div className="text-[0.85rem] leading-relaxed">
        <b>Structure prête — en attente de tes vraies données.</b>
        <span className="text-muted"> Les coffres, contrats et opérations de ton Discord s&apos;afficheront ici dès que le bot aura poussé ses données. Aucun chiffre affiché n&apos;est inventé.</span>
      </div>
    </div>
  );
}

const KPI_ICONS = [Wallet, Landmark, FileText, Target];

function Kpis({ data }: { data: DashData }) {
  const K = data.connecte;
  const kpis = [
    { label: "Coffre commun", value: K ? money(data.coffres.commun) : "—" },
    { label: "Coffre Confrérie", value: K ? money(data.coffres.illegal) : "—" },
    { label: "Contrats en cours", value: K ? String(data.contratsEnCours) : "—" },
    { label: "Opérations actives", value: K ? String(data.opsActives) : "—" },
  ];
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {kpis.map((k, i) => {
        const Icon = KPI_ICONS[i] ?? Wallet;
        return (
          <Card key={k.label} delay={0.02 + i * 0.06}>
            <div className="flex items-center justify-between">
              <span className="text-[0.72rem] font-semibold uppercase tracking-[0.09em] text-muted">{k.label}</span>
              <span className="grid h-[30px] w-[30px] place-items-center rounded-[9px] text-accent" style={{ background: "color-mix(in srgb,var(--accent) 15%,transparent)" }}>
                <Icon className="h-4 w-4" strokeWidth={1.8} />
              </span>
            </div>
            <div className={clsx("tabular mb-1 mt-3 font-num text-[1.9rem] font-semibold", K ? "text-ink" : "text-faint")}>{k.value}</div>
            <div className="text-[0.72rem] text-faint">{K ? "À jour" : "En attente de la base"}</div>
          </Card>
        );
      })}
    </div>
  );
}

function Tresorerie() {
  // Pas encore de journal de transactions synchronisé — état vide honnête.
  return (
    <Card delay={0.16}>
      <CardHeader titre="Trésorerie — 30 derniers jours" />
      <Empty>La courbe de trésorerie se construira à partir des mouvements de coffre (entrées &amp; sorties) une fois l&apos;historique des transactions synchronisé.</Empty>
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

function Attention({ data }: { data: DashData }) {
  const items = data.attention;
  return (
    <Card delay={0.22}>
      <CardHeader titre="Ce qui demande ton attention" action={items.length ? "Tout voir" : undefined} />
      {items.length === 0 ? (
        <Empty>Validations de contrats et opérations en préparation remonteront ici automatiquement.</Empty>
      ) : (
        <div className="flex flex-col">
          {items.map((a, i) => (
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

function OpsBoard({ data }: { data: DashData }) {
  const ops = data.operations;
  const total = ops.preparation.length + ops.encours.length + ops.terminees.length;
  return (
    <Card delay={0.24}>
      <CardHeader titre="Opérations" action={total ? "Ouvrir le tableau" : undefined} />
      {total === 0 ? (
        <Empty>Les opérations de ton salon #operations apparaîtront ici : préparation par étapes, en cours, puis terminées.</Empty>
      ) : (
        <div className="grid gap-3 sm:grid-cols-3">
          {(["preparation", "encours", "terminees"] as const).map((col) => {
            const label = col === "preparation" ? "Préparation" : col === "encours" ? "En cours" : "Terminées";
            return (
              <div key={col}>
                <div className="mb-2.5 flex items-center gap-2 text-[0.72rem] uppercase tracking-[0.08em] text-muted">
                  {label} <span className="ml-auto font-num text-faint">{ops[col].length}</span>
                </div>
                {ops[col].map((o, i) => (
                  <div key={`${o.titre}-${i}`} className="mb-2.5 cursor-pointer rounded-[11px] border border-border bg-surface-2 px-3 py-2.5 transition hover:-translate-y-0.5 hover:border-border-2">
                    <div className="text-[0.83rem] font-semibold">{o.titre}</div>
                    <div className="mt-2 flex items-center gap-2 text-[0.7rem] text-muted">
                      <span className="rounded-md px-1.5 py-0.5 text-[0.62rem] font-bold" style={{ background: "color-mix(in srgb,var(--accent) 16%,transparent)", color: "var(--accent)" }}>{o.type}</span>
                      {o.membres.length ? <span>{o.membres.length} agent(s)</span> : null}
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
  // Pas encore de flux de notifications synchronisé — état vide honnête.
  return (
    <Card delay={0.28}>
      <CardHeader titre="Notifications récentes" />
      <Empty>Les notifications de ton Discord (validations, RDV, changements de statut…) arriveront ici une fois le centre de notifications branché.</Empty>
    </Card>
  );
}

export function Dashboard({ data }: { data: DashData }) {
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[1.9rem] tracking-[0.01em]" style={{ textWrap: "balance" } as React.CSSProperties}>Tableau de bord</h1>
          <div className="mt-1 text-[0.85rem] text-muted">Vue d&apos;ensemble de la maison{data.connecte ? ` · ${data.membresCount} membre(s)` : ""}</div>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 text-[0.72rem] text-muted">
          <span className="h-2 w-2 rounded-full" style={{ background: data.connecte ? "var(--good)" : "var(--faint)" }} />
          {data.connecte ? "Données en direct" : "Base non connectée"}
        </span>
      </div>

      <BandeauAttente connecte={data.connecte} />
      <Kpis data={data} />

      <div className="grid items-start gap-4 lg:grid-cols-[2fr_1fr]">
        <Tresorerie />
        <Attention data={data} />
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[2fr_1fr]">
        <OpsBoard data={data} />
        <NotifFeed />
      </div>
    </>
  );
}
