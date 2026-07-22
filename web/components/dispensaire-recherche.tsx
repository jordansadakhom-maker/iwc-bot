"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Search, Loader2, ArrowRight } from "lucide-react";
import { inputCls } from "@/components/edit-ui";
import { rechercher, type ResultItem } from "@/app/dispensaire/recherche/actions";

const TYPE_TONE: Record<string, string> = { Salarié: "var(--accent)", Patient: "var(--good)", Produit: "var(--accent)", "Matière": "var(--warn)", Coffre: "var(--muted)", Facture: "var(--oxblood)", Document: "var(--muted)", Rapport: "var(--accent)", Entreprise: "var(--good)" };

export function DispensaireRecherche() {
  const [q, setQ] = useState("");
  const [res, setRes] = useState<ResultItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [fait, setFait] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (q.trim().length < 2) { setRes([]); setFait(false); setBusy(false); return; }
    setBusy(true);
    timer.current = setTimeout(async () => {
      const r = await rechercher(q);
      setRes(r); setBusy(false); setFait(true);
    }, 280);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [q]);

  // Regroupe par type.
  const groupes = res.reduce<Record<string, ResultItem[]>>((acc, r) => { (acc[r.type] ||= []).push(r); return acc; }, {});

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2"><Search className="h-5 w-5 text-accent" /><h2 className="font-display text-[1.15rem]">Recherche globale</h2></div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-faint" />
        {busy ? <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-faint" /> : null}
        <input className={inputCls + " py-2.5 pl-9 text-[0.95rem]"} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Salarié, patient, produit, coffre, facture, document, entreprise…" autoFocus />
      </div>

      {q.trim().length >= 2 && fait && res.length === 0 && !busy ? (
        <p className="px-1 py-10 text-center text-[0.85rem] italic text-faint">Aucun résultat pour «&nbsp;{q}&nbsp;».</p>
      ) : null}

      {Object.entries(groupes).map(([type, list]) => (
        <section key={type}>
          <div className="mb-1.5 text-[0.72rem] font-semibold uppercase tracking-[0.05em]" style={{ color: TYPE_TONE[type] || "var(--muted)" }}>{type} <span className="font-num text-faint">({list.length})</span></div>
          <div className="flex flex-col gap-1.5">
            {list.map((r, i) => (
              <Link key={type + i} href={r.href} className="group flex items-center gap-3 rounded-[12px] border border-border bg-surface-2 p-2.5 transition hover:border-border-2">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[0.7rem] font-bold" style={{ background: `color-mix(in srgb,${TYPE_TONE[type] || "var(--muted)"} 14%,transparent)`, color: TYPE_TONE[type] || "var(--muted)" }}>{type.slice(0, 2)}</span>
                <div className="min-w-0 flex-1"><div className="truncate text-[0.86rem] font-semibold">{r.label}</div>{r.sub ? <div className="truncate text-[0.72rem] text-faint">{r.sub}</div> : null}</div>
                <ArrowRight className="h-4 w-4 shrink-0 text-faint transition group-hover:translate-x-0.5" />
              </Link>
            ))}
          </div>
        </section>
      ))}

      {q.trim().length < 2 ? <p className="px-1 py-8 text-center text-[0.82rem] italic text-faint">Tape au moins 2 lettres pour lancer la recherche.</p> : null}
    </div>
  );
}
