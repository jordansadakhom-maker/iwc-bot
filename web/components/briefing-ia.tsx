"use client";

import { useState } from "react";
import { Newspaper, Loader2, RefreshCw } from "lucide-react";
import { genererBriefingDuJour } from "@/app/(app)/dashboard/actions";
import { LireBtn } from "@/components/mic-dictee";

// Briefing du jour rédigé par l'IA à la demande (un clic = un appel), à partir
// des vraies données. Pas d'appel automatique au chargement du tableau de bord.
export function BriefingIA() {
  const [busy, setBusy] = useState(false);
  const [texte, setTexte] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function go() {
    setBusy(true); setErr(null);
    const r = await genererBriefingDuJour();
    setBusy(false);
    if (r.ok && r.texte) setTexte(r.texte); else setErr(r.error || "Briefing indisponible.");
  }

  return (
    <section className="rounded-card border border-border bg-surface p-4 shadow-card" style={{ background: "linear-gradient(180deg,var(--surface),color-mix(in srgb,var(--surface) 88%,#000))" }}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-[0.8rem] font-semibold uppercase tracking-[0.06em] text-muted">
          <Newspaper className="h-4 w-4 text-accent" /> Briefing du jour
        </div>
        <div className="flex items-center gap-2">
          {texte ? <LireBtn texte={texte} /> : null}
          <button onClick={go} disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[0.78rem] font-semibold text-black/85 disabled:opacity-60"
            style={{ background: "var(--accent)" }}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : texte ? <RefreshCw className="h-3.5 w-3.5" /> : <Newspaper className="h-3.5 w-3.5" />}
            {busy ? "Rédaction…" : texte ? "Actualiser" : "Générer le briefing"}
          </button>
        </div>
      </div>
      {err ? <p className="mt-3 text-[0.82rem]" style={{ color: "var(--oxblood)" }}>{err}</p> : null}
      {texte ? (
        <p className="mt-3 whitespace-pre-wrap text-[0.9rem] leading-relaxed text-ink">{texte}</p>
      ) : !err ? (
        <p className="mt-3 text-[0.84rem] text-muted">Un point de situation rédigé par l&apos;IA à partir de tes vraies données (opérations, contrats, absents, rendez-vous). Clique pour le générer.</p>
      ) : null}
    </section>
  );
}
