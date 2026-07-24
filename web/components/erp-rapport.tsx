"use client";

import { useState } from "react";
import { FileText, Copy, Printer, Check } from "lucide-react";
import { rapportEnTexte, type Rapport } from "@/lib/erp-rapport-const";

// Rapport automatique — consultable, copiable (presse-papier) et imprimable.
export function RapportPanel({ rapport }: { rapport: Rapport }) {
  const [copied, setCopied] = useState(false);
  async function copier() {
    try { await navigator.clipboard.writeText(rapportEnTexte(rapport)); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* presse-papier indisponible */ }
  }
  return (
    <section className="rounded-[14px] border border-border bg-surface p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-[0.9rem] font-semibold"><FileText className="h-4 w-4 text-accent" /> Rapport automatique</h3>
        <div className="flex items-center gap-1.5 print:hidden">
          <button onClick={copier} className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-[0.74rem] font-semibold text-muted transition hover:text-ink">{copied ? <Check className="h-3.5 w-3.5" style={{ color: "var(--good)" }} /> : <Copy className="h-3.5 w-3.5" />} {copied ? "Copié" : "Copier"}</button>
          <button onClick={() => window.print()} className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-[0.74rem] font-semibold text-muted transition hover:text-ink"><Printer className="h-3.5 w-3.5" /> Imprimer</button>
        </div>
      </div>
      <p className="text-[0.7rem] text-faint">{rapport.titre} · {rapport.genereLe}</p>

      <div className="mt-2 grid gap-x-6 sm:grid-cols-2">
        {rapport.lignes.map((l, i) => (
          <div key={i} className="flex items-center justify-between gap-3 border-b border-border/50 py-1 text-[0.82rem]">
            <span className="text-muted">{l.label}</span><span className="font-num font-semibold">{l.valeur}</span>
          </div>
        ))}
      </div>

      <p className="mt-2.5 text-[0.82rem]"><b>Synthèse :</b> <span className="text-muted">{rapport.synthese}</span></p>

      {rapport.faits.length ? (
        <div className="mt-2">
          <div className="text-[0.68rem] font-semibold uppercase tracking-[0.05em] text-faint">Points d&apos;attention</div>
          <ul className="mt-1 flex list-disc flex-col gap-0.5 pl-4 text-[0.8rem] text-muted">
            {rapport.faits.map((f, i) => <li key={i}>{f}</li>)}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
