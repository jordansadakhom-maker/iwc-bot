"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Download, ChevronDown } from "lucide-react";
import { activiteMeta, modulesDe, filtrerActivite, motifDe, diffAvantApres, activiteCSV, type ActiviteItem } from "@/lib/activite";
import { useNotificationsRealtime } from "@/lib/use-notifications-realtime";
import { inputCls } from "@/components/edit-ui";

const dtFR = (s: string) => { if (!s) return ""; try { return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(s)); } catch { return ""; } };

function Detail({ a }: { a: ActiviteItem }) {
  const diff = diffAvantApres(a);
  const motif = motifDe(a);
  const [ouvert, setOuvert] = useState(false);
  if (!diff.length && !motif) return null;
  return (
    <div className="mt-1">
      {motif ? <div className="text-[0.74rem] text-muted">Motif : <span className="text-ink">{motif}</span></div> : null}
      {diff.length ? (
        <>
          <button onClick={() => setOuvert((v) => !v)} className="mt-0.5 inline-flex items-center gap-1 text-[0.72rem] text-accent hover:underline">
            <ChevronDown className={"h-3 w-3 transition-transform " + (ouvert ? "rotate-180" : "")} />
            {ouvert ? "Masquer" : `${diff.length} changement${diff.length > 1 ? "s" : ""}`}
          </button>
          {ouvert ? (
            <div className="mt-1 overflow-hidden rounded-[8px] border border-border">
              {diff.map((d) => (
                <div key={d.champ} className="flex flex-wrap items-baseline gap-x-2 border-b border-border px-2.5 py-1 text-[0.74rem] last:border-b-0">
                  <span className="min-w-[6rem] font-semibold text-muted">{d.champ}</span>
                  <span className="text-faint line-through">{d.de}</span>
                  <span aria-hidden className="text-faint">→</span>
                  <span className="text-ink">{d.vers}</span>
                </div>
              ))}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

export function ActiviteJournal({ initial }: { initial: ActiviteItem[] }) {
  const router = useRouter();
  const [module, setModule] = useState("tous");
  const [q, setQ] = useState("");
  const [dateDebut, setDateDebut] = useState("");
  const [dateFin, setDateFin] = useState("");
  const modules = useMemo(() => modulesDe(initial), [initial]);
  const affiches = useMemo(() => filtrerActivite(initial, module, q, dateDebut, dateFin), [initial, module, q, dateDebut, dateFin]);

  // Temps réel : un nouvel événement rafraîchit le journal (sans recharger).
  useNotificationsRealtime(() => router.refresh());

  function exporter() {
    const csv = activiteCSV(affiches);
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `journal-activite-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

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
        <input type="date" className={inputCls + " max-w-[150px]"} value={dateDebut} onChange={(e) => setDateDebut(e.target.value)} aria-label="Depuis" title="Depuis" />
        <input type="date" className={inputCls + " max-w-[150px]"} value={dateFin} onChange={(e) => setDateFin(e.target.value)} aria-label="Jusqu'au" title="Jusqu'au" />
        <button onClick={exporter} disabled={!affiches.length} className="inline-flex items-center gap-1.5 rounded-[10px] border border-border bg-surface px-3 py-2 text-[0.8rem] font-semibold text-ink transition hover:border-accent disabled:opacity-40" title="Exporter en CSV">
          <Download className="h-3.5 w-3.5" /> CSV
        </button>
      </div>

      {affiches.length === 0 ? (
        <p className="px-1 py-10 text-center text-[0.85rem] italic text-faint">Aucune activité pour ce filtre. Les actions sensibles (suppressions, coffre, RH, recrutement…) s&apos;enregistrent ici au fil de l&apos;eau.</p>
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
                  <Detail a={a} />
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
