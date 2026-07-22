import { BarChart3, Clock, Bandage, Package, ShieldCheck, Moon, TrendingUp, Users } from "lucide-react";
import type { StatsData, Barre } from "@/lib/dispensaire-stats";
import { Flash } from "@/components/edit-ui";

const money = (n: number) => `$${Math.round(n).toLocaleString("fr-FR")}`;

// Barres verticales (séries temporelles) — ancrées à la ligne de base, une seule teinte.
function VBar({ data, hue = "var(--accent)" }: { data: Barre[]; hue?: string }) {
  const max = Math.max(1, ...data.map((d) => d.valeur));
  return (
    <div className="flex items-end gap-1.5" style={{ height: 120 }}>
      {data.map((d, i) => (
        <div key={i} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1" title={`${d.label} · ${d.libelle ?? d.valeur}`}>
          <div className="w-full rounded-t-[3px]" style={{ height: `${Math.max(2, Math.round((d.valeur / max) * 100))}%`, background: d.valeur ? hue : "color-mix(in srgb,var(--ink) 10%,transparent)", minHeight: 2 }} />
          <span className="w-full truncate text-center text-[0.6rem] text-faint">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

// Barres horizontales (classements) — libellé + barre + valeur.
function HBar({ data, hue = "var(--accent)", fmt }: { data: Barre[]; hue?: string; fmt?: (n: number) => string }) {
  const max = Math.max(1, ...data.map((d) => d.valeur));
  if (!data.length) return <p className="py-4 text-center text-[0.8rem] italic text-faint">Aucune donnée.</p>;
  return (
    <div className="flex flex-col gap-1.5">
      {data.map((d, i) => (
        <div key={i} className="flex items-center gap-2 text-[0.78rem]">
          <span className="w-28 shrink-0 truncate text-muted">{d.label}</span>
          <div className="h-3.5 flex-1 overflow-hidden rounded-full" style={{ background: "color-mix(in srgb,var(--ink) 8%,transparent)" }}>
            <div className="h-full rounded-full" style={{ width: `${Math.max(3, Math.round((d.valeur / max) * 100))}%`, background: hue }} />
          </div>
          <span className="w-14 shrink-0 text-right font-num text-faint">{d.libelle ?? (fmt ? fmt(d.valeur) : d.valeur)}</span>
        </div>
      ))}
    </div>
  );
}

function Carte({ children, titre, icon: Icon }: { children: React.ReactNode; titre: string; icon: typeof Clock }) {
  return (
    <section className="rounded-[14px] border border-border bg-surface p-4">
      <h3 className="mb-3 flex items-center gap-2 text-[0.86rem] font-semibold"><Icon className="h-4 w-4 text-accent" /> {titre}</h3>
      {children}
    </section>
  );
}

export function DispensaireStats({ data }: { data: StatsData }) {
  const k = data.kpis;
  const kpis = [
    { label: "Salariés actifs", val: String(k.salariesActifs), sub: `${k.enService} en service`, icon: Users, tone: "var(--accent)" },
    { label: "CA du mois", val: money(k.caMois), sub: "ventes", icon: TrendingUp, tone: "var(--good)" },
    { label: "Dépenses du mois", val: money(k.depensesMois), sub: "frais virés", icon: TrendingUp, tone: "var(--warn)" },
    { label: "Soins FDO", val: String(k.soinsFDO), sub: money(k.montantFDO), icon: ShieldCheck, tone: "var(--accent)" },
    { label: "Stocks en alerte", val: String(k.articlesAlerte), sub: `${k.articles} articles`, icon: Package, tone: k.articlesAlerte ? "var(--oxblood)" : "var(--faint)" },
    { label: "Matières en rupture", val: String(k.matieresRupture), sub: "à commander", icon: Package, tone: k.matieresRupture ? "var(--oxblood)" : "var(--faint)" },
    { label: "Factures impayées", val: String(k.facturesImpayees), sub: `${money(k.du)} dû`, icon: BarChart3, tone: k.facturesImpayees ? "var(--warn)" : "var(--faint)" },
    { label: "Absences injust.", val: String(data.absences.injustifiees), sub: `${data.absences.justifiees} justifiées`, icon: Moon, tone: data.absences.injustifiees ? "var(--oxblood)" : "var(--faint)" },
  ];

  const totalAbs = Math.max(1, data.absences.justifiees + data.absences.injustifiees);
  const pctJust = Math.round((data.absences.justifiees / totalAbs) * 100);

  return (
    <div className="flex flex-col gap-4">
      {!data.pret ? <Flash tone="bad">Les statistiques s&apos;alimenteront dès que les modules du dispensaire contiennent des données (SQL exécuté).</Flash> : null}

      <div className="flex items-center gap-2"><BarChart3 className="h-5 w-5 text-accent" /><h2 className="font-display text-[1.15rem]">Statistiques du dispensaire</h2></div>

      {/* KPIs */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((t) => {
          const Icon = t.icon;
          return (
            <div key={t.label} className="rounded-[14px] border border-border bg-surface-2 p-3">
              <div className="flex items-center justify-between"><span className="text-[0.72rem] text-faint">{t.label}</span><Icon className="h-4 w-4" style={{ color: t.tone }} /></div>
              <div className="mt-1 font-num text-[1.4rem] font-bold leading-none" style={{ color: t.tone }}>{t.val}</div>
              <div className="mt-1 text-[0.68rem] text-faint">{t.sub}</div>
            </div>
          );
        })}
      </div>

      {/* Séries temporelles */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Carte titre="Heures travaillées (7 jours)" icon={Clock}><VBar data={data.heuresParJour} /></Carte>
        <Carte titre="Ventes de bandages (14 jours)" icon={Bandage}><VBar data={data.ventesParJour} hue="var(--good)" /></Carte>
      </div>

      <Carte titre="Chiffre d'affaires par jour (14 jours)" icon={TrendingUp}><VBar data={data.caParJour} hue="var(--good)" /></Carte>

      {/* Classements */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Carte titre="Produits les plus utilisés" icon={Package}><HBar data={data.topProduits} /></Carte>
        <Carte titre="Soins FDO par bureau" icon={ShieldCheck}><HBar data={data.fdoParBureau} hue="var(--warn)" fmt={money} /></Carte>
      </div>

      {/* Absences */}
      <Carte titre="Absences (justifiées / injustifiées)" icon={Moon}>
        <div className="flex items-center gap-3">
          <div className="flex h-4 flex-1 overflow-hidden rounded-full" style={{ background: "color-mix(in srgb,var(--ink) 8%,transparent)" }}>
            <div className="h-full" style={{ width: `${pctJust}%`, background: "var(--good)" }} title={`Justifiées : ${data.absences.justifiees}`} />
            <div className="h-full" style={{ width: `${100 - pctJust}%`, background: "var(--oxblood)" }} title={`Injustifiées : ${data.absences.injustifiees}`} />
          </div>
        </div>
        <div className="mt-2 flex gap-4 text-[0.74rem]">
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: "var(--good)" }} /> Justifiées <b className="font-num">{data.absences.justifiees}</b></span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: "var(--oxblood)" }} /> Injustifiées <b className="font-num">{data.absences.injustifiees}</b></span>
        </div>
      </Carte>
    </div>
  );
}
