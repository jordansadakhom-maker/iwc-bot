"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { activiteMeta, modulesDe, filtrerActivite, type ActiviteItem } from "@/lib/activite";
import { inputCls } from "@/components/edit-ui";

const dtFR = (s: string) => { if (!s) return ""; try { return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(s)); } catch { return ""; } };

export function ActiviteJournal({ initial }: { initial: ActiviteItem[] }) {
  const [module, setModule] = useState("tous");
  const [q, setQ] = useState("");
  const modules = useMemo(() => modulesDe(initial), [initial]);
  const affiches = useMemo(() => filtrerActivite(initial, module, q), [initial, module, q]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[12rem]">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint" />
          <input className={inputCls + " pl-8"} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher (action, cible, auteur)…" />
        </div>
        <select className={inputCls + " max-w-[190px]"} value={module} onChange={(e) => setModule(e.target.value)}>
          <option value="tous">Tous les modules</option>
          {modules.map((m) => <option key={m} value={m}>{activiteMeta(m).label}</option>)}
        </select>
      </div>

      {affiches.length === 0 ? (
        <p className="px-1 py-10 text-center text-[0.85rem] italic text-faint">Aucune activité pour ce filtre. Les actions sensibles (suppressions, coffre, portefeuilles…) s&apos;enregistrent ici au fil de l&apos;eau.</p>
      ) : (
        <div className="flex flex-col divide-y divide-border">
          {affiches.map((a) => {
            const meta = activiteMeta(a.module);
            return (
              <div key={a.id} className="flex items-start gap-3 py-2.5">
                <span className="mt-0.5 text-[1rem]" aria-hidden>{meta.icon}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-[0.7rem] font-semibold uppercase tracking-[0.05em]" style={{ color: "var(--accent)" }}>{meta.label}</span>
                    <span className="text-[0.86rem]">{a.action}{a.cible ? <span className="text-muted"> — {a.cible}</span> : null}</span>
                  </div>
                  <div className="mt-0.5 text-[0.72rem] text-faint">{a.par || "Système"}{a.cibleId ? ` · ${a.cibleId}` : ""}</div>
                </div>
                <span className="shrink-0 text-[0.72rem] tabular-nums text-faint">{dtFR(a.at)}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
