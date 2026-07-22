import { Users, Target, Landmark, HeartPulse, BarChart3 } from "lucide-react";
import { getStatistiques } from "@/lib/queries";
import { PageHeader, Card, CardHeader, Empty } from "@/components/ui";
import { BarresH, Donut, Repartition } from "@/components/charts";
import { AireTemps } from "@/components/aire-temps";
import { cents } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Statistiques — Iron Wolf Company" };

function Kpi({ icon: Icon, label, valeur, tone, sous }: { icon: typeof Users; label: string; valeur: string; tone: string; sous?: string }) {
  return (
    <div className="rounded-card border border-border bg-surface p-4 shadow-card">
      <div className="flex items-center gap-2 text-[0.66rem] uppercase tracking-[0.06em] text-faint">
        <span className="grid h-6 w-6 place-items-center rounded-md" style={{ color: tone, background: `color-mix(in srgb,${tone} 15%,transparent)` }}><Icon className="h-3.5 w-3.5" /></span>
        {label}
      </div>
      <div className="mt-2 font-num text-[1.7rem] font-semibold tabular-nums">{valeur}</div>
      {sous ? <div className="mt-0.5 text-[0.72rem] text-faint">{sous}</div> : null}
    </div>
  );
}

export default async function StatistiquesPage() {
  const s = await getStatistiques();
  const money = (n: number) => `${cents(n)}$`;
  const totalOps = s.opsParPhase.reduce((a, p) => a + p.value, 0);

  return (
    <>
      <PageHeader titre="Statistiques" sous="Vue d'ensemble de la compagnie — chiffres réels" actif={s.connecte} />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Kpi icon={Users} label="Membres" valeur={String(s.kpis.membres)} tone="var(--steel)" sous="âmes sous la bannière" />
        <Kpi icon={Target} label="Opérations menées" valeur={String(s.kpis.opsTerminees)} tone="var(--good)" sous={totalOps > 0 ? `sur ${totalOps} au total` : undefined} />
        <Kpi icon={Landmark} label="Coffre armurerie" valeur={money(s.kpis.coffreArmurerie)} tone="var(--accent)" />
        <Kpi icon={HeartPulse} label="Aptes au service" valeur={String(s.kpis.aptes)} tone="var(--good)" sous={s.kpis.membres > 0 ? `sur ${s.kpis.membres} de la meute` : undefined} />
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader titre="La meute, rang par rang" />
          {s.parGrade.length ? <BarresH data={s.parGrade} /> : <Empty icon={Users}>Aucun membre synchronisé.</Empty>}
        </Card>
        <Card>
          <CardHeader titre="Répartition par pôle" />
          {s.parPole.length ? <Repartition data={s.parPole} /> : <Empty icon={Users}>Aucun effectif.</Empty>}
        </Card>
        <Card>
          <CardHeader titre="Opérations par phase" />
          {s.opsParPhase.some((p) => p.value > 0) ? <Donut data={s.opsParPhase} /> : <Empty icon={Target}>Aucune opération.</Empty>}
        </Card>
        <Card>
          <CardHeader titre="Aptitude médicale de la meute" />
          {s.medicalParStatut.length ? <BarresH data={s.medicalParStatut} /> : <Empty icon={HeartPulse}>Aucun dossier médical.</Empty>}
        </Card>
        <Card>
          <CardHeader titre="L'état des coffres" />
          {s.coffres.length ? <Repartition data={s.coffres} money /> : <Empty icon={Landmark}>Coffres non alimentés.</Empty>}
        </Card>
        <div className="lg:col-span-1">
          <AireTemps points={s.coffreEvolution} titre="Évolution du coffre de l'armurerie" />
        </div>
      </div>
    </>
  );
}
