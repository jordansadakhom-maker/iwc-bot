"use client";

import { useState } from "react";
import { Loader2, Check, X, ScrollText } from "lucide-react";
import { signerOffre, refuserOffre, type OffreContrat } from "@/app/suivi/contrat/actions";

const SENS_TXT = (s: string | null) =>
  s === "client_propose"
    ? "La Iron Wolf Company s'engage à mener cette mission aux conditions ci-dessous."
    : "En signant, vous confiez cette mission à la Iron Wolf Company aux conditions ci-dessous.";

export function SignContrat({ token, offre, statutInitial }: { token: string; offre: OffreContrat; statutInitial: string }) {
  const [statut, setStatut] = useState(statutInitial);
  const [busy, setBusy] = useState<"signe" | "refuse" | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function agir(signe: boolean) {
    setErr(null); setBusy(signe ? "signe" : "refuse");
    const r = signe ? await signerOffre(token) : await refuserOffre(token);
    setBusy(null);
    if (!r.ok) { setErr(r.error || "Action impossible."); if (r.statut) setStatut(r.statut); return; }
    setStatut(r.statut || (signe ? "signe" : "refuse"));
  }

  const Ligne = ({ label, val }: { label: string; val: string | null }) =>
    val ? <div className="flex gap-2 text-[0.86rem]"><span className="shrink-0 text-faint">{label}</span><span className="text-ink">{val}</span></div> : null;

  if (statut === "signe" || statut === "refuse") {
    const ok = statut === "signe";
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <span className="grid h-12 w-12 place-items-center rounded-full" style={{ background: ok ? "color-mix(in srgb,var(--good) 18%,transparent)" : "color-mix(in srgb,var(--oxblood) 16%,transparent)", color: ok ? "var(--good)" : "var(--oxblood)" }}>
          {ok ? <Check className="h-6 w-6" /> : <X className="h-6 w-6" />}
        </span>
        <p className="text-[0.95rem] font-semibold">{ok ? "Contrat signé — merci !" : "Contrat refusé."}</p>
        <p className="max-w-[320px] text-[0.82rem] text-muted">{ok ? "La Iron Wolf Company a été prévenue et va prendre le relais." : "La Iron Wolf Company a été informée de ton refus."}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2 text-[0.8rem] text-muted"><ScrollText className="h-4 w-4 text-accent" /> Contrat d&apos;opération</div>
      <div className="flex flex-col gap-1.5 rounded-[10px] border border-border bg-surface-2 px-3.5 py-3">
        <Ligne label="Commanditaire" val={offre.commanditaire} />
        <Ligne label="Mission" val={offre.categorie} />
        <Ligne label="Objectif" val={offre.objectif} />
        <Ligne label="Lieu" val={offre.lieu} />
        <Ligne label="Rémunération" val={offre.remuneration} />
        {offre.conditions ? <div className="mt-1 border-t border-border pt-2 text-[0.82rem]"><span className="text-faint">Conditions&nbsp;: </span>{offre.conditions}</div> : null}
      </div>
      <p className="text-[0.82rem] text-muted">{SENS_TXT(offre.sens)}</p>
      {err ? <p className="text-center text-[0.82rem]" style={{ color: "var(--oxblood)" }}>{err}</p> : null}
      <div className="flex gap-2">
        <button onClick={() => agir(true)} disabled={!!busy} className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-[0.88rem] font-semibold text-black/85 disabled:opacity-60" style={{ background: "var(--accent)" }}>
          {busy === "signe" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Je signe
        </button>
        <button onClick={() => agir(false)} disabled={!!busy} className="inline-flex items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-[0.88rem] font-semibold disabled:opacity-60" style={{ borderColor: "color-mix(in srgb,var(--oxblood) 45%,var(--border))", color: "var(--oxblood)" }}>
          {busy === "refuse" ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />} Refuser
        </button>
      </div>
    </div>
  );
}
