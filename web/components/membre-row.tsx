"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Loader2, Check, X, Star, BadgeDollarSign } from "lucide-react";
import { Badge } from "@/components/ui";
import { cents } from "@/lib/format";
import { majFicheMembre } from "@/app/(app)/membres/actions";
import type { MembreDetail } from "@/lib/queries";

const STATUT_TONE: Record<string, "good" | "warn" | "muted"> = {
  actif: "good", absent: "warn", inactif: "muted", parti: "muted", visiteur: "muted",
};
function initiales(nom: string) {
  return nom.split(/\s+/).filter(Boolean).map((s) => s[0]).slice(0, 2).join("").toUpperCase() || "?";
}
const inputCls = "w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-[0.86rem] text-ink outline-none placeholder:text-faint focus:border-[color-mix(in_srgb,var(--accent)_55%,var(--border))]";

export function MembreRow({ m, tone }: { m: MembreDetail; tone: "accent" | "oxblood" }) {
  const router = useRouter();
  const f = m.ficheRH || {};
  const [open, setOpen] = useState(false);
  const [specialite, setSpecialite] = useState(f.specialite || "");
  const [statutInterne, setStatutInterne] = useState(f.statutInterne || "");
  const [salaire, setSalaire] = useState(f.salaire ? String(f.salaire) : "");
  const [notes, setNotes] = useState(f.notes || "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const resume = [f.specialite, f.statutInterne, f.salaire ? `${cents(f.salaire)}$` : ""].filter(Boolean).join(" · ");

  async function enregistrer() {
    setErr(null);
    setBusy(true);
    const r = await majFicheMembre(m.id, { specialite, statutInterne, salaire: Number(salaire) || 0, notes });
    setBusy(false);
    if (!r.ok) { setErr(r.error || "Échec."); return; }
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <div className="group flex items-center gap-3 py-2.5">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[0.72rem] font-extrabold text-black/85" style={{ background: tone === "oxblood" ? "linear-gradient(135deg,var(--oxblood),#000)" : "linear-gradient(135deg,var(--accent),color-mix(in srgb,var(--accent) 30%,#000))" }}>
          {initiales(m.nomIC)}
        </div>
        <div className="min-w-0">
          <div className="truncate text-[0.9rem] font-semibold">{m.nomIC}</div>
          <div className="truncate text-[0.74rem] text-muted">{m.grade || "—"}{resume ? <span className="text-faint"> · {resume}</span> : null}</div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Badge tone={STATUT_TONE[m.statut?.toLowerCase()] ?? "muted"}>{m.statut}</Badge>
          <button onClick={() => setOpen(true)} className="grid h-8 w-8 place-items-center rounded-lg border border-border text-faint opacity-0 transition hover:border-accent hover:text-ink group-hover:opacity-100" aria-label="Éditer la fiche RH" title="Fiche RH">
            <Pencil className="h-[15px] w-[15px]" />
          </button>
        </div>
      </div>

      {open ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center px-4" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="relative w-full max-w-[440px] overflow-hidden rounded-2xl border border-border-2 bg-surface shadow-2xl">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div className="flex items-center gap-2 text-[0.9rem] font-semibold"><Star className="h-4 w-4 text-accent" /> Fiche RH — {m.nomIC}</div>
              <button onClick={() => setOpen(false)} className="text-faint hover:text-ink"><X className="h-4 w-4" /></button>
            </div>
            <div className="flex flex-col gap-3 p-4">
              <p className="text-[0.72rem] text-faint">Le grade et le statut restent gérés par Discord. Ces champs RH ne sont modifiables que sur le site — le bot n&apos;y touche jamais.</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block"><span className="mb-1 block text-[0.64rem] uppercase tracking-[0.06em] text-faint">Spécialité</span><input className={inputCls} value={specialite} onChange={(e) => setSpecialite(e.target.value)} placeholder="Tireur d'élite, éclaireur…" maxLength={80} /></label>
                <label className="block"><span className="mb-1 block text-[0.64rem] uppercase tracking-[0.06em] text-faint">Statut interne</span><input className={inputCls} value={statutInterne} onChange={(e) => setStatutInterne(e.target.value)} placeholder="Titulaire, en formation…" maxLength={60} /></label>
              </div>
              <label className="block"><span className="mb-1 block text-[0.64rem] uppercase tracking-[0.06em] text-faint">Salaire ($)</span><input className={inputCls} type="number" min={0} step="1" value={salaire} onChange={(e) => setSalaire(e.target.value)} placeholder="0" /></label>
              <label className="block"><span className="mb-1 block text-[0.64rem] uppercase tracking-[0.06em] text-faint">Notes RH</span><textarea className={inputCls + " min-h-[90px] resize-y leading-relaxed"} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Remarques, historique, sanctions, points forts…" maxLength={1500} /></label>
              {err ? <p className="text-[0.8rem]" style={{ color: "var(--oxblood)" }}>{err}</p> : null}
              <div className="flex justify-end gap-2 pt-1">
                <button onClick={() => setOpen(false)} className="rounded-lg border border-border bg-surface-2 px-3.5 py-2 text-[0.82rem] font-semibold hover:border-border-2">Annuler</button>
                <button onClick={enregistrer} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[0.82rem] font-semibold text-black/85 disabled:opacity-60" style={{ background: "var(--accent)" }}>{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Enregistrer</button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
