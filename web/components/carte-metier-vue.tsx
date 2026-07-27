import { Gauge, Shield, GraduationCap, Cross, Crosshair, Target, Users, type LucideIcon } from "lucide-react";
import { Card, CardHeader, Badge } from "@/components/ui";
import type { Cartographie, MetierStat, MembrePuce, Couverture } from "@/lib/carte-metier";

const ICONE: Record<string, LucideIcon> = {
  direction: Gauge, officier: Shield, instruction: GraduationCap, medecine: Cross, armurerie: Crosshair, terrain: Target,
};
const COUV: Record<Couverture, { label: string; tone: "good" | "warn" | "oxblood"; c: string }> = {
  ok: { label: "Couvert", tone: "good", c: "var(--good)" },
  fragile: { label: "Personne de présent", tone: "warn", c: "var(--warn)" },
  vide: { label: "Non couvert", tone: "oxblood", c: "var(--oxblood)" },
};

function Puce({ m }: { m: MembrePuce }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-2 px-2.5 py-1 text-[0.76rem]" style={m.absent ? { opacity: 0.6 } : undefined}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: m.absent ? "var(--muted)" : "var(--good)" }} />
      <span className={m.absent ? "text-muted line-through" : "text-ink"}>{m.nom}</span>
      {m.grade ? <span className="text-faint">· {m.grade}</span> : null}
    </span>
  );
}

function CarteMetier({ s }: { s: MetierStat }) {
  const Ic = ICONE[s.key] || Users;
  const cv = COUV[s.couverture];
  return (
    <Card className="flex flex-col gap-3" >
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl" style={{ color: cv.c, background: "color-mix(in srgb," + cv.c + " 14%,transparent)" }}>
          <Ic className="h-5 w-5" strokeWidth={1.8} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2"><span className="font-display text-lg">{s.label}</span><Badge tone={cv.tone}>{cv.label}</Badge></div>
          <div className="text-[0.76rem] text-muted">{s.description}</div>
        </div>
        <div className="shrink-0 text-right">
          <div className="font-num text-[1.25rem] font-bold leading-none">{s.presents}<span className="text-[0.8rem] font-normal text-faint">/{s.total}</span></div>
          <div className="text-[0.66rem] text-faint">présents</div>
        </div>
      </div>
      {s.membres.length === 0 ? (
        <p className="rounded-[10px] border border-dashed border-border px-3 py-2.5 text-[0.78rem] italic text-faint">Aucun membre sur cette fonction — à pourvoir.</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">{s.membres.map((m) => <Puce key={m.nom} m={m} />)}</div>
      )}
    </Card>
  );
}

export function CarteMetierVue({ carto }: { carto: Cartographie }) {
  const lacunes = carto.metiers.filter((m) => m.couverture !== "ok");
  return (
    <div className="flex flex-col gap-4">
      {lacunes.length > 0 ? (
        <div className="rounded-card border border-border bg-surface p-3.5 text-[0.85rem] shadow-card" style={{ borderColor: "color-mix(in srgb,var(--warn) 35%,var(--border))" }}>
          <b>À surveiller :</b>{" "}
          <span className="text-muted">{lacunes.map((m) => `${m.label} (${m.couverture === "vide" ? "non couvert" : "aucun présent"})`).join(" · ")}.</span>
        </div>
      ) : (
        <div className="rounded-card border border-border bg-surface p-3.5 text-[0.85rem] shadow-card" style={{ borderColor: "color-mix(in srgb,var(--good) 35%,var(--border))" }}>
          <b>Toutes les fonctions sont couvertes.</b> <span className="text-muted">Chaque métier compte au moins un membre présent. 🐺</span>
        </div>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-2">
        {carto.metiers.map((s) => <CarteMetier key={s.key} s={s} />)}
      </div>

      {carto.nonClasses.length > 0 ? (
        <Card>
          <CardHeader titre="Sans métier identifié" compteur={carto.nonClasses.length} />
          <p className="mb-2.5 text-[0.78rem] text-muted">Ces membres n&apos;ont pas de fonction déductible de leur grade ou de leur fiche RH. Complète leur fiche pour les rattacher à un métier.</p>
          <div className="flex flex-wrap gap-1.5">{carto.nonClasses.map((m) => <Puce key={m.nom} m={m} />)}</div>
        </Card>
      ) : null}
    </div>
  );
}
