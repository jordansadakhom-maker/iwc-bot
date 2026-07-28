"use client";

import Link from "next/link";
import { Inbox, ArrowRight, UserCheck, Clock } from "lucide-react";
import { statutDemandeDef, prioriteDemandeDef, typeDemandeDef, depuis, STATUTS_OUVERTS, type DemandesData } from "@/lib/demandes-const";

// Résumé « Demandes » pour le tableau de bord — centre de contrôle : ce qui est
// en attente, non assigné, et les dossiers ouverts les plus prioritaires.
export function DemandesResume({ data, monId }: { data: DemandesData; monId?: string | null }) {
  if (!data.pret) return null;
  const ouvertes = data.demandes.filter((d) => STATUTS_OUVERTS.includes(d.statut as never));
  const top = [...ouvertes].sort((a, b) => prioriteDemandeDef(a.priorite).ordre - prioriteDemandeDef(b.priorite).ordre).slice(0, 5);

  return (
    <section className="rounded-[14px] border border-border bg-surface p-4">
      <div className="mb-3 flex items-center gap-2">
        <Inbox className="h-4 w-4 text-accent" />
        <h3 className="text-[0.9rem] font-semibold">Demandes</h3>
        <Link href="/demandes" className="ml-auto inline-flex items-center gap-0.5 text-[0.72rem] font-semibold text-faint transition hover:text-accent">Le guichet <ArrowRight className="h-3 w-3" /></Link>
      </div>
      <div className="mb-3 grid grid-cols-3 gap-2">
        <div className="rounded-[11px] border border-border bg-surface-2 p-2.5 text-center"><div className="font-num text-[1.3rem] font-bold" style={{ color: "var(--accent)" }}>{data.stats.ouvertes}</div><div className="text-[0.68rem] text-faint">Ouvertes</div></div>
        <div className="rounded-[11px] border border-border bg-surface-2 p-2.5 text-center"><div className="font-num text-[1.3rem] font-bold" style={{ color: data.stats.nonAssignees ? "var(--warn)" : "var(--ink)" }}>{data.stats.nonAssignees}</div><div className="text-[0.68rem] text-faint">Non assignées</div></div>
        <div className="rounded-[11px] border border-border bg-surface-2 p-2.5 text-center"><div className="font-num text-[1.3rem] font-bold" style={{ color: data.stats.miennes ? "var(--good)" : "var(--ink)" }}>{data.stats.miennes}</div><div className="text-[0.68rem] text-faint">Les miennes</div></div>
      </div>
      {top.length === 0 ? <p className="py-2 text-center text-[0.8rem] italic text-faint">Aucune demande ouverte. 🎉</p> : (
        <div className="flex flex-col divide-y divide-border/60">
          {top.map((d) => {
            const st = statutDemandeDef(d.statut); const pr = prioriteDemandeDef(d.priorite); const ty = typeDemandeDef(d.type);
            const mien = d.assigneId && d.assigneId === monId;
            return (
              <Link key={d.id} href={`/demandes/${d.id}`} className="flex items-center gap-2 py-1.5 text-[0.82rem] transition hover:opacity-80">
                <span className="shrink-0" aria-hidden>{ty.icon}</span>
                <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: pr.tone }} title={pr.label} />
                <span className="min-w-0 flex-1 truncate font-medium">{d.titre}</span>
                <span className="shrink-0 text-[0.68rem]" style={{ color: st.tone }}>{st.label}</span>
                {d.assigneNom ? <span className="shrink-0 text-faint" title={d.assigneNom}><UserCheck className="h-3 w-3" style={mien ? { color: "var(--good)" } : undefined} /></span> : <Clock className="h-3 w-3 shrink-0 text-warn" aria-label="non assignée" />}
                <span className="hidden shrink-0 text-[0.66rem] text-faint sm:inline">{depuis(d.createdAt)}</span>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
