import { BarChart3, Clock, Bandage, Package, ShieldCheck, Moon, TrendingUp, TrendingDown, Users, Receipt } from "lucide-react";
import type { StatsData } from "@/lib/dispensaire-stats";
import { Flash } from "@/components/edit-ui";
import { StatWidget, SectionHeader } from "@/components/dispensaire-premium";
import { ChartCard, AreaChart, BarsH, Donut } from "@/components/dispensaire-charts";

const money = (n: number) => `$${Math.round(n).toLocaleString("fr-FR")}`;

// Page « Statistiques » du Dispensaire — refonte PREMIUM : cartouches KPI animées
// (StatWidget) + graphiques SVG interactifs (survol, infobulle, export CSV). Le
// rendu reste serveur ; les briques interactives sont des composants client.
export function DispensaireStats({ data }: { data: StatsData }) {
  const k = data.kpis;

  return (
    <div className="flex flex-col gap-5">
      {!data.pret ? <Flash tone="bad">Les statistiques s&apos;alimenteront dès que les modules du dispensaire contiennent des données (SQL exécuté).</Flash> : null}

      {/* Indicateurs clés — cartouches animées, cohérentes avec le cockpit */}
      <div className="disp-rise grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
        <StatWidget label="Salariés actifs" value={k.salariesActifs} icon={Users} tone="accent" sous={`${k.enService} en service`} />
        <StatWidget label="CA du mois" value={k.caMois} format={money} icon={TrendingUp} tone="good" sous="Ventes encaissées" />
        <StatWidget label="Dépenses du mois" value={k.depensesMois} format={money} icon={TrendingDown} tone="warn" sous="Frais virés" />
        <StatWidget label="Soins FDO" value={k.soinsFDO} icon={ShieldCheck} tone="accent" sous={money(k.montantFDO)} />
        <StatWidget label="Stocks en alerte" value={k.articlesAlerte} icon={Package} tone={k.articlesAlerte ? "crit" : "steel"} sous={`${k.articles} articles`} />
        <StatWidget label="Matières en rupture" value={k.matieresRupture} icon={Package} tone={k.matieresRupture ? "crit" : "steel"} sous="À commander" />
        <StatWidget label="Factures impayées" value={k.facturesImpayees} icon={Receipt} tone={k.facturesImpayees ? "warn" : "steel"} sous={`${money(k.du)} dû`} />
        <StatWidget label="Absences injust." value={data.absences.injustifiees} icon={Moon} tone={data.absences.injustifiees ? "crit" : "steel"} sous={`${data.absences.justifiees} justifiées`} />
      </div>

      <SectionHeader eyebrow="Analyse" titre="Statistiques du dispensaire" sous="Séries sur 7 à 14 jours · survolez les courbes, exportez en CSV." icon={BarChart3} />

      {/* Séries temporelles — courbes interactives */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard titre="Heures travaillées (7 jours)" icon={Clock} data={data.heuresParJour} exportName="heures-7j">
          <AreaChart id="heures" data={data.heuresParJour} fmt={(n) => `${Math.round(n)} min`} />
        </ChartCard>
        <ChartCard titre="Ventes de bandages (14 jours)" icon={Bandage} data={data.ventesParJour} exportName="ventes-14j">
          <AreaChart id="ventes" data={data.ventesParJour} hue="var(--good)" />
        </ChartCard>
      </div>

      <ChartCard titre="Chiffre d'affaires par jour (14 jours)" icon={TrendingUp} data={data.caParJour} exportName="ca-14j">
        <AreaChart id="ca" data={data.caParJour} hue="var(--good)" fmt={money} />
      </ChartCard>

      {/* Classements */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard titre="Produits les plus utilisés" icon={Package} data={data.topProduits} exportName="top-produits">
          <BarsH data={data.topProduits} />
        </ChartCard>
        <ChartCard titre="Soins FDO par bureau" icon={ShieldCheck} data={data.fdoParBureau} exportName="fdo-bureau">
          <BarsH data={data.fdoParBureau} hue="var(--warn)" fmt={money} />
        </ChartCard>
      </div>

      {/* Absences — donut interactif */}
      <ChartCard titre="Absences (justifiées / injustifiées)" icon={Moon}>
        <Donut a={data.absences.justifiees} b={data.absences.injustifiees} colA="var(--good)" colB="var(--crit)" labelA="Justifiées" labelB="Injustifiées" />
      </ChartCard>
    </div>
  );
}
