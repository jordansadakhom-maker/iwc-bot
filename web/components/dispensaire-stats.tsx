import { BarChart3, Clock, Bandage, Package, ShieldCheck, Moon, TrendingUp, Users } from "lucide-react";
import type { StatsData, Barre } from "@/lib/dispensaire-stats";
import { Flash } from "@/components/edit-ui";
import { Cartouche } from "@/components/dispensaire-ui";

const money = (n: number) => `$${Math.round(n).toLocaleString("fr-FR")}`;

// Courbe à l'encre (série temporelle) : trait fin ancré à la ligne de base, léger
// aplat sous la courbe, filets réglés — dans l'esprit d'un tracé à la plume. Rendu
// serveur pur (SVG), largeur fluide via preserveAspectRatio + trait non mis à l'échelle.
function Courbe({ data, hue = "var(--accent)", id, fmt }: { data: Barre[]; hue?: string; id: string; fmt?: (n: number) => string }) {
  const W = 100, H = 40;
  const max = Math.max(1, ...data.map((d) => d.valeur));
  const n = data.length;
  if (!n) return <p className="py-6 text-center text-[0.8rem] italic text-faint">Aucune donnée.</p>;
  const pts = data.map((d, i) => {
    const x = n > 1 ? (i / (n - 1)) * W : W / 2;
    const y = H - 2 - (d.valeur / max) * (H - 5);
    return [x, y] as const;
  });
  const line = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
  const area = `M${pts[0][0].toFixed(1)} ${H} ` + pts.map((p) => "L" + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ") + ` L${pts[n - 1][0].toFixed(1)} ${H} Z`;
  return (
    <div className="flex flex-col gap-1.5">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="112" preserveAspectRatio="none" style={{ display: "block", overflow: "visible" }}>
        <defs>
          <linearGradient id={`cg-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={hue} stopOpacity="0.22" />
            <stop offset="1" stopColor={hue} stopOpacity="0" />
          </linearGradient>
        </defs>
        {[10, 20, 30].map((y) => <line key={y} x1="0" y1={y} x2={W} y2={y} stroke="color-mix(in srgb,var(--ink) 8%,transparent)" strokeWidth="1" vectorEffect="non-scaling-stroke" />)}
        <path d={area} fill={`url(#cg-${id})`} />
        <path d={line} fill="none" stroke={hue} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="flex justify-between text-[0.6rem] text-faint">
        <span>{data[0]?.label}</span>
        <span className="font-num">crête {fmt ? fmt(max) : max}</span>
        <span>{data[n - 1]?.label}</span>
      </div>
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

      {/* Cartouches d'indicateurs */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((t) => <Cartouche key={t.label} label={t.label} valeur={t.val} ton={t.tone} icon={t.icon} sous={t.sub} />)}
      </div>

      {/* Séries temporelles — courbes à l'encre */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Carte titre="Heures travaillées (7 jours)" icon={Clock}><Courbe id="heures" data={data.heuresParJour} /></Carte>
        <Carte titre="Ventes de bandages (14 jours)" icon={Bandage}><Courbe id="ventes" data={data.ventesParJour} hue="var(--good)" /></Carte>
      </div>

      <Carte titre="Chiffre d'affaires par jour (14 jours)" icon={TrendingUp}><Courbe id="ca" data={data.caParJour} hue="var(--good)" fmt={money} /></Carte>

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
