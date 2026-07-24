import Link from "next/link";
import { Sparkles, Lightbulb, ArrowRight, AlertTriangle, Info, ShieldCheck } from "lucide-react";
import { resumeAuto, GRAVITE_TON, GRAVITE_LABEL, type AssistantData, type Gravite } from "@/lib/erp-assistant-const";

// Panneau « Veille automatique » — présentationnel, réutilisé par le Dispensaire
// et l'IWC. Affiche le rapport auto du jour + les constats classés par gravité,
// chacun avec son action suggérée et un lien direct.

const ORDRE: Gravite[] = ["critique", "important", "info"];

export function AssistantPanel({ data }: { data: AssistantData }) {
  const { constats, parGravite, genereLe } = data;
  const resume = resumeAuto(constats);

  return (
    <section className="flex flex-col gap-3">
      {/* Rapport auto */}
      <div className="flex items-start gap-3 rounded-[14px] border p-3.5" style={{ borderColor: "color-mix(in srgb,var(--accent) 30%,var(--border))", background: "color-mix(in srgb,var(--accent) 6%,transparent)" }}>
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] text-accent" style={{ background: "color-mix(in srgb,var(--accent) 15%,transparent)" }}><Sparkles className="h-[18px] w-[18px]" strokeWidth={1.8} /></span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <b className="text-[0.9rem]">Veille automatique</b>
            {genereLe ? <span className="text-[0.68rem] text-faint">· {genereLe}</span> : null}
          </div>
          <p className="mt-0.5 text-[0.85rem] text-muted">{resume}</p>
          {constats.length ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {ORDRE.map((g) => parGravite[g] ? (
                <span key={g} className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.68rem] font-bold" style={{ color: GRAVITE_TON[g], background: `color-mix(in srgb,${GRAVITE_TON[g]} 13%,transparent)` }}>{parGravite[g]} {GRAVITE_LABEL[g]}</span>
              ) : null)}
            </div>
          ) : null}
        </div>
      </div>

      {!data.pret ? <p className="rounded-[12px] border border-border bg-surface-2 px-3 py-2 text-[0.78rem] text-faint">Les données ne sont pas encore accessibles — la veille s'activera dès qu'elles le seront.</p> : null}

      {constats.length === 0 ? (
        data.pret ? (
          <div className="flex items-center gap-2.5 rounded-[14px] border border-border bg-surface p-4 text-[0.85rem] text-muted"><ShieldCheck className="h-5 w-5" style={{ color: "var(--good)" }} /> Tout est sous contrôle — aucun point d&apos;attention détecté.</div>
        ) : null
      ) : (
        ORDRE.map((g) => {
          const list = constats.filter((c) => c.gravite === g);
          if (!list.length) return null;
          return (
            <div key={g} className="flex flex-col gap-1.5">
              <div className="flex items-center gap-1.5 text-[0.72rem] font-semibold uppercase tracking-[0.05em]" style={{ color: GRAVITE_TON[g] }}>
                {g === "info" ? <Info className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />} {GRAVITE_LABEL[g]} <span className="font-num">({list.length})</span>
              </div>
              {list.map((c) => (
                <div key={c.id} className="flex flex-wrap items-start gap-3 rounded-[12px] border bg-surface p-3" style={{ borderColor: `color-mix(in srgb,${GRAVITE_TON[g]} 30%,var(--border))` }}>
                  <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: GRAVITE_TON[g], boxShadow: `0 0 0 3px color-mix(in srgb,${GRAVITE_TON[g]} 16%,transparent)` }} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="rounded-full border border-border px-1.5 py-0.5 text-[0.6rem] font-bold uppercase text-faint">{c.categorie}</span>
                      <span className="text-[0.88rem] font-semibold">{c.titre}</span>
                    </div>
                    {c.detail ? <div className="mt-0.5 text-[0.74rem] text-faint">{c.detail}</div> : null}
                    <div className="mt-1 flex items-start gap-1.5 text-[0.78rem] text-muted"><Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: "var(--warn)" }} /> {c.suggestion}</div>
                  </div>
                  <Link href={c.href} className="group inline-flex shrink-0 items-center gap-1 self-center rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-[0.74rem] font-semibold text-muted transition hover:text-ink">Voir <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" /></Link>
                </div>
              ))}
            </div>
          );
        })
      )}
    </section>
  );
}
