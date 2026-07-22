import {
  Inbox, Star, Coins, Target, Eye, Users, HeartPulse, CalendarDays, Crosshair,
  Sparkles, Bell, FileText, Megaphone, ShieldCheck, Skull, type LucideIcon,
} from "lucide-react";
import clsx from "clsx";
import { HorlogeCampagne } from "@/components/horloge-campagne";

// Primitives d'interface partagées par les pages (serveur-compatibles, sans hooks).

// Emblème (médaillon) choisi d'après le titre de la page — donne à chaque
// section un sceau distinct, sans rien changer aux pages.
const EMBLEMES: [RegExp, LucideIcon][] = [
  [/finance/i, Coins], [/op[ée]ration|contrat/i, Target], [/renseign/i, Eye],
  [/avis|recherch|wanted/i, Skull],
  [/membre/i, Users], [/m[ée]dical/i, HeartPulse], [/agenda|client/i, CalendarDays],
  [/armurerie|inventaire|arme/i, Crosshair], [/assistant/i, Sparkles],
  [/notification/i, Bell], [/document/i, FileText], [/communication/i, Megaphone],
  [/administration/i, ShieldCheck],
];
function emblemePour(titre: string): LucideIcon {
  for (const [re, ic] of EMBLEMES) if (re.test(titre)) return ic;
  return Star;
}

// Filet ornemental (losange laiton central) — sépare l'en-tête du contenu.
export function Ornement({ className }: { className?: string }) {
  return (
    <div className={clsx("flex items-center gap-3", className)} aria-hidden>
      <span className="h-px flex-1" style={{ background: "linear-gradient(90deg,transparent,color-mix(in srgb,var(--accent) 45%,transparent))" }} />
      <span className="h-1.5 w-1.5 rotate-45 rounded-[1px]" style={{ background: "var(--accent)" }} />
      <span className="h-px flex-1" style={{ background: "linear-gradient(270deg,transparent,color-mix(in srgb,var(--accent) 45%,transparent))" }} />
    </div>
  );
}

export function PoleChip({ pole }: { pole: "iwc" | "confrerie" }) {
  const conf = pole === "confrerie";
  const c = conf ? "var(--oxblood)" : "var(--brass)";
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.7rem] font-semibold"
      style={{ color: c, borderColor: "color-mix(in srgb," + c + " 45%,var(--border))", background: "color-mix(in srgb," + c + " 10%,transparent)" }}
    >
      <span>{conf ? "🔪" : "⚖️"}</span>
      {conf ? "La Confrérie" : "Iron Wolf"}
    </span>
  );
}

export function PageHeader({ titre, sous, actif, pole }: { titre: string; sous?: string; actif?: boolean; pole?: "iwc" | "confrerie" }) {
  const Emb = emblemePour(titre);
  return (
    <div className="iwc-rise">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          {/* médaillon-sceau en laiton */}
          <span
            className="grid h-12 w-12 shrink-0 place-items-center rounded-full border"
            style={{ borderColor: "color-mix(in srgb,var(--accent) 55%,var(--border))", background: "radial-gradient(circle at 30% 25%, color-mix(in srgb,var(--accent) 24%,transparent), color-mix(in srgb,var(--surface) 92%,#000) 72%)", boxShadow: "inset 0 0 0 1px color-mix(in srgb,var(--accent) 20%,transparent)" }}
          >
            <Emb className="h-[22px] w-[22px]" style={{ color: "var(--accent)" }} strokeWidth={1.7} />
          </span>
          <div>
            <h1 className="font-display text-[1.9rem] leading-none tracking-[0.01em]">{titre}</h1>
            {sous ? <div className="mt-1.5 font-display text-[0.9rem] italic text-muted">{sous}</div> : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <HorlogeCampagne />
          {pole ? <PoleChip pole={pole} /> : null}
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 text-[0.72rem] text-muted">
            <span className="h-2 w-2 rounded-full" style={{ background: actif ? "var(--good)" : "var(--faint)" }} />
            {actif ? "Données en direct" : "En attente de la base"}
          </span>
        </div>
      </div>
      <Ornement className="mt-3.5" />
    </div>
  );
}

// En-tête de catégorie : un repère visuel pour regrouper les cartes par thème.
export function SectionTitle({ children, tone = "var(--accent)", icon: Icon }: { children: React.ReactNode; tone?: string; icon?: LucideIcon }) {
  return (
    <div className="mt-2 flex items-center gap-3">
      <span className="h-4 w-1 rounded-full" style={{ background: tone }} />
      {Icon ? <Icon className="h-4 w-4" style={{ color: tone }} strokeWidth={2} /> : null}
      <h2 className="text-[0.72rem] font-bold uppercase tracking-[0.16em] text-muted">{children}</h2>
      <span className="h-px flex-1" style={{ background: "linear-gradient(90deg,var(--border),transparent)" }} />
    </div>
  );
}

export function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <section
      className={clsx("rounded-card border border-border bg-surface p-[18px] shadow-card", className)}
      style={{ background: "linear-gradient(180deg,var(--surface),color-mix(in srgb,var(--surface) 88%,#000))" }}
    >
      {children}
    </section>
  );
}

export function CardHeader({ titre, compteur }: { titre: string; compteur?: number | string }) {
  return (
    <div className="mb-3.5 flex items-center justify-between gap-2.5">
      <h3 className="text-[0.8rem] font-semibold uppercase tracking-[0.06em] text-muted">{titre}</h3>
      {compteur !== undefined ? <span className="font-num text-[0.8rem] text-faint">{compteur}</span> : null}
    </div>
  );
}

export function Empty({ icon: Icon = Inbox, children }: { icon?: LucideIcon; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
      <span
        className="grid h-11 w-11 place-items-center rounded-full border"
        style={{ borderColor: "color-mix(in srgb,var(--accent) 30%,var(--border))", background: "color-mix(in srgb,var(--accent) 8%,transparent)" }}
      >
        <Icon className="h-5 w-5" style={{ color: "color-mix(in srgb,var(--accent) 70%,var(--faint))" }} strokeWidth={1.6} />
      </span>
      <p className="max-w-md font-display text-[0.9rem] italic leading-relaxed text-muted">{children}</p>
      <span className="mt-0.5 text-[0.66rem] uppercase tracking-[0.22em] text-faint">— Rien à signaler, chef —</span>
    </div>
  );
}

export function Badge({ children, tone = "accent" }: { children: React.ReactNode; tone?: "accent" | "good" | "warn" | "muted" | "oxblood" }) {
  const map = {
    accent: { c: "var(--accent)", b: "color-mix(in srgb,var(--accent) 16%,transparent)" },
    good: { c: "var(--good)", b: "color-mix(in srgb,var(--good) 16%,transparent)" },
    warn: { c: "var(--warn)", b: "color-mix(in srgb,var(--warn) 16%,transparent)" },
    muted: { c: "var(--muted)", b: "color-mix(in srgb,var(--ink) 8%,transparent)" },
    oxblood: { c: "var(--oxblood)", b: "color-mix(in srgb,var(--oxblood) 18%,transparent)" },
  }[tone];
  return (
    <span className="rounded-md px-1.5 py-0.5 text-[0.62rem] font-bold uppercase tracking-[0.04em]" style={{ color: map.c, background: map.b }}>
      {children}
    </span>
  );
}
