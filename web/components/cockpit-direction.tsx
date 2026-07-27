"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Wallet, Users, Target, ListChecks, MessagesSquare, ArrowUpRight, AlertTriangle, ShieldCheck, Activity, Moon } from "lucide-react";
import { Card, CardHeader, Empty, Badge } from "@/components/ui";
import { cents } from "@/lib/format";
import { useNotificationsRealtime } from "@/lib/use-notifications-realtime";
import { resumeDirection, TON_LABEL, type Cockpit, type CockpitTon } from "@/lib/cockpit";

const money = (n: number | null) => (typeof n === "number" ? `${cents(n)}$` : "—");
const TON_VAR: Record<CockpitTon, string> = { calme: "var(--good)", vigilance: "var(--warn)", tendu: "var(--oxblood)" };
const TON_ICON: Record<CockpitTon, typeof ShieldCheck> = { calme: ShieldCheck, vigilance: Activity, tendu: AlertTriangle };
const alerteVar = (tone: string) => (tone === "oxblood" ? "var(--oxblood)" : tone === "warn" ? "var(--warn)" : tone === "good" ? "var(--good)" : "var(--accent)");

function Tuile({ href, icon: Icon, label, valeur, sous, tone }: { href: string; icon: typeof Wallet; label: string; valeur: string; sous?: string; tone?: string }) {
  return (
    <Link href={href} className="group flex items-start gap-3 rounded-[13px] border border-border bg-surface-2 p-3.5 transition hover:border-[color-mix(in_srgb,var(--accent)_50%,var(--border))]">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg" style={{ color: tone || "var(--accent)", background: "color-mix(in srgb," + (tone || "var(--accent)") + " 14%,transparent)" }}>
        <Icon className="h-[18px] w-[18px]" strokeWidth={1.8} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[0.72rem] uppercase tracking-[0.05em] text-faint">{label}</div>
        <div className="font-num text-[1.25rem] font-bold leading-tight">{valeur}</div>
        {sous ? <div className="text-[0.74rem] text-muted">{sous}</div> : null}
      </div>
      <ArrowUpRight className="h-4 w-4 shrink-0 text-faint transition group-hover:text-ink" />
    </Link>
  );
}

export function CockpitDirection({ data }: { data: Cockpit }) {
  const router = useRouter();
  useNotificationsRealtime(() => router.refresh());

  const { tresorerie: tr, effectifs: ef, charge, taches, conversations, attention, attentionTotal } = data;
  const coffreNegatif = [tr.commun, tr.legal, tr.illegal, tr.armurerie].some((v) => typeof v === "number" && v < 0) || tr.total < 0;
  const { ton, texte } = resumeDirection({ attentionTotal, tachesEnRetard: taches.enRetard, coffreNegatif });
  const TonIc = TON_ICON[ton];

  return (
    <div className="flex flex-col gap-4">
      {/* Synthèse */}
      <div className="flex items-center gap-3 rounded-card border border-border bg-surface p-4 shadow-card" style={{ borderColor: "color-mix(in srgb," + TON_VAR[ton] + " 35%,var(--border))" }}>
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl" style={{ color: TON_VAR[ton], background: "color-mix(in srgb," + TON_VAR[ton] + " 15%,transparent)" }}>
          <TonIc className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-2"><span className="font-display text-lg">État de la compagnie</span><Badge tone={ton === "calme" ? "good" : ton === "vigilance" ? "warn" : "oxblood"}>{TON_LABEL[ton]}</Badge></div>
          <div className="text-[0.85rem] text-muted">{texte}</div>
        </div>
      </div>

      {/* Trésorerie */}
      <Card>
        <CardHeader titre="Trésorerie consolidée" compteur={money(tr.total)} />
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          <Tuile href="/finances" icon={Wallet} label="Coffre commun" valeur={money(tr.commun)} tone={typeof tr.commun === "number" && tr.commun < 0 ? "var(--oxblood)" : "var(--accent)"} />
          <Tuile href="/finances" icon={Wallet} label="Coffre légal" valeur={money(tr.legal)} tone={typeof tr.legal === "number" && tr.legal < 0 ? "var(--oxblood)" : "var(--accent)"} />
          <Tuile href="/finances" icon={Wallet} label="Coffre illégal" valeur={money(tr.illegal)} tone={typeof tr.illegal === "number" && tr.illegal < 0 ? "var(--oxblood)" : "var(--accent)"} />
          <Tuile href="/armurerie" icon={Wallet} label="Coffre armurerie" valeur={money(tr.armurerie)} tone={typeof tr.armurerie === "number" && tr.armurerie < 0 ? "var(--oxblood)" : "var(--accent)"} />
        </div>
      </Card>

      {/* Signaux opérationnels */}
      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        <Tuile href="/membres" icon={Users} label="Effectif" valeur={String(ef.total)} sous={`${ef.presents} présent(s) · ${ef.absents} absent(s)`} />
        <Tuile href="/absences" icon={Moon} label="Absents" valeur={String(ef.absents)} sous="Sur le terrain" tone="var(--warn)" />
        <Tuile href="/operations" icon={Target} label="Charge opérationnelle" valeur={String(charge.opsActives)} sous={`${charge.contratsEnCours} contrat(s) en cours`} />
        <Tuile href="/taches" icon={ListChecks} label="Tâches en cours" valeur={String(taches.enCours)} sous={taches.enRetard > 0 ? `${taches.enRetard} en retard` : "À jour"} tone={taches.enRetard > 0 ? "var(--oxblood)" : "var(--accent)"} />
        <Tuile href="/messages" icon={MessagesSquare} label="Conversations" valeur={String(conversations.ouvertes)} sous={`${conversations.total} au total`} />
      </div>

      {/* File d'attention */}
      <Card>
        <CardHeader titre="À traiter en priorité" compteur={attentionTotal} />
        {attention.length === 0 ? (
          <Empty icon={ShieldCheck}>Rien en attente. La compagnie tourne. 🐺</Empty>
        ) : (
          <div className="flex flex-col divide-y divide-border">
            {attention.map((a) => (
              <Link key={a.key} href={a.href} className="group flex items-center gap-3 py-2.5">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: alerteVar(a.tone) }} />
                <span className="min-w-0 flex-1 truncate text-[0.86rem]">{a.label}</span>
                <ArrowUpRight className="h-4 w-4 shrink-0 text-faint transition group-hover:text-ink" />
              </Link>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
