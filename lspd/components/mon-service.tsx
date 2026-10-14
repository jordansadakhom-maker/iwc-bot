"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Radio, Loader2, Play, Square, ShieldCheck } from "lucide-react";
import { prendreService, terminerService, setStatutRadio } from "@/app/(app)/service/actions";

type Canal = { id: string; nom: string; code: string | null; type: string };
type Service = { id: string; indicatif: string | null; canalNom: string | null; statutRadio: string; debut: string } | null;

const STATUTS: { key: string; label: string; tone: string }[] = [
  { key: "dispo", label: "Disponible", tone: "good" },
  { key: "occupe", label: "Occupé", tone: "warn" },
  { key: "intervention", label: "En intervention", tone: "crit" },
  { key: "indispo", label: "Indispo", tone: "faint" },
];

function heure(iso: string) {
  try { return new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(new Date(iso)); } catch { return "—"; }
}

export function MonService({ enService, canaux, agentId, indicatifPropose }: { enService: Service; canaux: Canal[]; agentId: string | null; indicatifPropose: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [indicatif, setIndicatif] = useState(indicatifPropose || "");
  const [canalId, setCanalId] = useState(canaux.find((c) => c.type === "patrol")?.id || canaux[0]?.id || "");
  const [err, setErr] = useState<string | null>(null);

  async function prendre() {
    setBusy(true); setErr(null);
    const r = await prendreService({ indicatif: indicatif.trim() || undefined, canalId: canalId || undefined });
    setBusy(false);
    if (!r.ok) { setErr(r.error || "Impossible."); return; }
    setOpen(false);
    router.refresh();
  }
  async function terminer() {
    setBusy(true); setErr(null);
    const r = await terminerService();
    setBusy(false);
    if (!r.ok) { setErr(r.error || "Impossible."); return; }
    router.refresh();
  }
  async function statut(k: string) {
    setBusy(true); setErr(null);
    const r = await setStatutRadio(k);
    setBusy(false);
    if (!r.ok) { setErr(r.error || "Impossible."); return; }
    router.refresh();
  }

  if (!agentId) {
    return (
      <div className="rounded-card border border-border bg-surface p-4 shadow-card">
        <div className="flex items-center gap-2 text-[0.84rem] text-muted"><ShieldCheck className="h-4 w-4 text-faint" /> Ta fiche agent n&apos;est pas encore créée — un responsable doit t&apos;ajouter à l&apos;effectif pour que tu puisses prendre ton service.</div>
      </div>
    );
  }

  if (enService) {
    return (
      <div className="rounded-card border p-4 shadow-card" style={{ borderColor: "color-mix(in srgb,var(--good) 40%,var(--border))", background: "color-mix(in srgb,var(--good) 7%,var(--surface))" }}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <span className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 font-display text-[0.95rem] font-bold tracking-[0.04em]" style={{ background: "color-mix(in srgb,var(--navy) 22%,transparent)", color: "var(--navy-hi)" }}>
            <Radio className="h-4 w-4" /> {enService.indicatif || "—"}
          </span>
          <span className="text-[0.82rem] text-ink">En service{enService.canalNom ? <> · canal <b>{enService.canalNom}</b></> : null}</span>
          <span className="font-num text-[0.72rem] text-faint">depuis {heure(enService.debut)}</span>
          <button onClick={terminer} disabled={busy} className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[0.76rem] font-semibold text-muted transition hover:text-crit disabled:opacity-60">
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Square className="h-3.5 w-3.5" />} Terminer
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {STATUTS.map((st) => {
            const actif = enService.statutRadio === st.key;
            return (
              <button key={st.key} onClick={() => statut(st.key)} disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[0.76rem] font-semibold transition disabled:opacity-60"
                style={actif ? { background: `color-mix(in srgb,var(--${st.tone}) 22%,transparent)`, color: `var(--${st.tone})`, boxShadow: `inset 0 0 0 1px color-mix(in srgb,var(--${st.tone}) 45%,transparent)` } : { color: "var(--muted)", border: "1px solid var(--border)" }}>
                <span className="h-2 w-2 rounded-full" style={{ background: `var(--${st.tone})` }} /> {st.label}
              </button>
            );
          })}
        </div>
        {err ? <p className="mt-2 text-[0.78rem]" style={{ color: "var(--crit)" }}>{err}</p> : null}
      </div>
    );
  }

  return (
    <div className="rounded-card border border-border bg-surface p-4 shadow-card">
      {!open ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex h-2.5 w-2.5 rounded-full" style={{ background: "var(--faint)" }} />
          <span className="text-[0.86rem] text-muted">Tu es <b className="text-ink">hors service</b>.</span>
          <button onClick={() => setOpen(true)} className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[0.8rem] font-semibold text-black/85" style={{ background: "var(--good)" }}>
            <Play className="h-4 w-4" /> Prendre mon service
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="text-[0.82rem] font-semibold text-ink">Prise de service</div>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-[0.66rem] uppercase tracking-[0.05em] text-faint">Indicatif</span>
              <input value={indicatif} onChange={(e) => setIndicatif(e.target.value)} placeholder="indicatif proposé" className="rounded-lg border border-border bg-bg px-3 py-2 text-[0.85rem] outline-none focus:border-navy" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[0.66rem] uppercase tracking-[0.05em] text-faint">Canal radio</span>
              <select value={canalId} onChange={(e) => setCanalId(e.target.value)} className="rounded-lg border border-border bg-bg px-3 py-2 text-[0.85rem] outline-none focus:border-navy">
                <option value="">— aucun —</option>
                {canaux.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
              </select>
            </label>
          </div>
          {err ? <p className="text-[0.78rem]" style={{ color: "var(--crit)" }}>{err}</p> : null}
          <div className="flex justify-end gap-2">
            <button onClick={() => { setOpen(false); setErr(null); }} className="rounded-lg border border-border bg-surface px-3 py-1.5 text-[0.8rem] font-semibold text-muted">Annuler</button>
            <button onClick={prendre} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[0.8rem] font-semibold text-black/85 disabled:opacity-60" style={{ background: "var(--good)" }}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Confirmer
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
