"use client";

import { FileText, Wallet, Landmark, Target, Plug, Inbox, Users, Activity, Coins, Compass } from "lucide-react";
import clsx from "clsx";
import type { DashData } from "@/lib/queries";
import { BarresH, Donut, Repartition } from "@/components/charts";
import { PoleChip, SectionTitle, Ornement } from "@/components/ui";
import { cents } from "@/lib/format";

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
  return "$" + cents(n);
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

function Kpis({ data }: { data: DashData }) {
  const K = data.connecte;
  const conf = data.pole === "confrerie";
  const kpis = [
    { label: "Coffre commun", value: K ? money(data.coffres.commun) : "—", icon: Wallet, tone: "#c98500" },
    { label: conf ? "Coffre Confrérie" : "Coffre Iron Wolf", value: K ? money(conf ? data.coffres.illegal : data.coffres.legal) : "—", icon: Landmark, tone: conf ? "var(--oxblood)" : "#3987e5" },
    { label: "Contrats en cours", value: K ? String(data.contratsEnCours) : "—", icon: FileText, tone: "#199e70" },
    { label: "Opérations actives", value: K ? String(data.opsActives) : "—", icon: Target, tone: "#9085e9" },
  ];
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {kpis.map((k, i) => {
        const Icon = k.icon;
        return (
          <Card key={k.label} delay={0.02 + i * 0.06}>
            <div className="flex items-center justify-between">
              <span className="text-[0.72rem] font-semibold uppercase tracking-[0.09em] text-muted">{k.label}</span>
              <span className="grid h-[32px] w-[32px] place-items-center rounded-[9px]" style={{ color: k.tone, background: `color-mix(in srgb,${k.tone} 15%,transparent)` }}>
                <Icon className="h-4 w-4" strokeWidth={1.9} />
              </span>
            </div>
            <div className={clsx("tabular mb-1 mt-3 font-num text-[1.95rem] font-semibold", K ? "text-ink" : "text-faint")}>{k.value}</div>
            <div className="flex items-center gap-1.5 text-[0.72rem] text-faint">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: K ? "var(--good)" : "var(--faint)" }} />
              {K ? "À jour" : "En attente de la base"}
            </div>
          </Card>
        );
      })}
    </div>
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


export function Dashboard({ data }: { data: DashData }) {
  return (
    <>
      <div>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full border" style={{ borderColor: "color-mix(in srgb,var(--accent) 55%,var(--border))", background: "radial-gradient(circle at 30% 25%, color-mix(in srgb,var(--accent) 24%,transparent), color-mix(in srgb,var(--surface) 92%,#000) 72%)", boxShadow: "inset 0 0 0 1px color-mix(in srgb,var(--accent) 20%,transparent)" }}>
              <Compass className="h-[22px] w-[22px]" style={{ color: "var(--accent)" }} strokeWidth={1.7} />
            </span>
            <div>
              <h1 className="font-display text-[1.9rem] leading-none tracking-[0.01em]" style={{ textWrap: "balance" } as React.CSSProperties}>Tableau de bord</h1>
              <div className="mt-1.5 font-display text-[0.9rem] italic text-muted">Poste de commandement de la maison{data.connecte ? ` · ${data.membresCount} âme(s) sous ta bannière` : ""}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <PoleChip pole={data.pole} />
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 text-[0.72rem] text-muted">
              <span className="h-2 w-2 rounded-full" style={{ background: data.connecte ? "var(--good)" : "var(--faint)" }} />
              {data.connecte ? "Données en direct" : "Base non connectée"}
            </span>
          </div>
        </div>
        <Ornement className="mt-3.5" />
      </div>

      <BandeauAttente connecte={data.connecte} />

      <SectionTitle tone="var(--accent)" icon={Coins}>Synthèse</SectionTitle>
      <Kpis data={data} />

      <SectionTitle tone="#3987e5" icon={Users}>Effectifs &amp; activité</SectionTitle>
      <div className="grid items-start gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2" delay={0.16}>
          <CardHeader titre="Membres par grade" />
          {data.membresParGrade.length ? (
            <BarresH data={data.membresParGrade} />
          ) : (
            <Empty>La répartition par grade s&apos;affichera dès la synchronisation des membres.</Empty>
          )}
        </Card>
        <Card delay={0.2}>
          <CardHeader titre="Opérations par phase" />
          {data.opsParPhase.some((p) => p.value > 0) ? (
            <Donut data={data.opsParPhase} />
          ) : (
            <Empty>Aucune opération en cours.</Empty>
          )}
        </Card>
      </div>

      <SectionTitle tone="#c98500" icon={Coins}>Finances</SectionTitle>
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Card delay={0.22}>
          <CardHeader titre="Soldes des coffres" />
          {data.connecte ? (
            <BarresH
              data={[
                { label: "Commun", value: data.coffres.commun ?? 0 },
                { label: "Iron Wolf", value: data.coffres.legal ?? 0 },
                { label: "Confrérie", value: data.coffres.illegal ?? 0 },
              ]}
              money
            />
          ) : (
            <Empty>Les soldes s&apos;afficheront à la connexion de la base.</Empty>
          )}
        </Card>
        <Card delay={0.24}>
          <CardHeader titre="Répartition de la trésorerie" />
          {data.connecte && (data.coffres.commun || data.coffres.legal || data.coffres.illegal) ? (
            <Repartition
              data={[
                { label: "Commun", value: data.coffres.commun ?? 0, color: "#c98500" },
                { label: "Iron Wolf", value: data.coffres.legal ?? 0, color: "#3987e5" },
                { label: "Confrérie", value: data.coffres.illegal ?? 0, color: "#e66767" },
              ]}
              money
            />
          ) : (
            <Empty>La répartition s&apos;affichera dès que les coffres seront alimentés.</Empty>
          )}
        </Card>
      </div>

      <SectionTitle tone="#9085e9" icon={Activity}>Pilotage</SectionTitle>
      <div className="grid items-start gap-4 lg:grid-cols-[2fr_1fr]">
        <OpsBoard data={data} />
        <Attention data={data} />
      </div>
    </>
  );
}
