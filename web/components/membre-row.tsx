"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Loader2, Check, X, Star, BadgeDollarSign, Target, BadgeCheck, HeartPulse, type LucideIcon } from "lucide-react";
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

// Rang → nombre d'insignes (étoiles), pour lire la hiérarchie d'un coup d'œil.
function gradeRang(grade: string | null): number {
  const g = (grade || "").toLowerCase();
  if (/fondateur/.test(g)) return 6;
  if (/conseil|directeur/.test(g)) return 5;
  if (/officier/.test(g)) return 4;
  if (/confirm/.test(g)) return 3;
  if (/op[ée]rateur/.test(g)) return 2;
  if (/recrue|probatoire/.test(g)) return 1;
  return 0;
}
function hashId(id: string) { let h = 0; for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0; return h; }
// N° de matricule stable (préfixe selon le pôle).
const matriculeFor = (m: MembreDetail) => (m.pole === "illegal" ? "CFR-" : "IWC-") + (1000 + (hashId(m.id) % 9000));
const clamp2: React.CSSProperties = { display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" };

function RankPips({ n, tone }: { n: number; tone: string }) {
  if (n <= 0) return null;
  return <span className="inline-flex items-center gap-0.5" aria-hidden>{Array.from({ length: n }).map((_, i) => <Star key={i} className="h-3 w-3" style={{ color: tone, fill: tone }} strokeWidth={0} />)}</span>;
}
function Info({ icon: Icon, label, children }: { icon: LucideIcon; label: string; children: React.ReactNode }) {
  return <span title={label} className="inline-flex items-center gap-1 rounded-md border border-border bg-surface-2 px-1.5 py-0.5 text-[0.68rem]"><Icon className="h-3 w-3 text-faint" /> <b className="font-medium text-ink">{children}</b></span>;
}

export function MembreRow({ m, tone, peutEditer = false, peutHabiliterMedecin = false }: { m: MembreDetail; tone: "accent" | "oxblood"; peutEditer?: boolean; peutHabiliterMedecin?: boolean }) {
  const router = useRouter();
  const f = m.ficheRH || {};
  const [open, setOpen] = useState(false);
  const [specialite, setSpecialite] = useState(f.specialite || "");
  const [statutInterne, setStatutInterne] = useState(f.statutInterne || "");
  const [salaire, setSalaire] = useState(f.salaire ? String(f.salaire) : "");
  const [notes, setNotes] = useState(f.notes || "");
  const [medecin, setMedecin] = useState(!!f.medecin);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const toneCol = tone === "oxblood" ? "var(--oxblood)" : "var(--brass)";

  async function enregistrer() {
    setErr(null);
    setBusy(true);
    const r = await majFicheMembre(m.id, { specialite, statutInterne, salaire: Number(salaire) || 0, notes, medecin });
    setBusy(false);
    if (!r.ok) { setErr(r.error || "Échec."); return; }
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <div className="group relative rounded-[12px] border p-3.5" style={{ borderColor: `color-mix(in srgb,${toneCol} 26%,var(--border))`, background: "linear-gradient(160deg,color-mix(in srgb,var(--surface-2) 94%,transparent),color-mix(in srgb,var(--surface-2) 82%,#000))" }}>
        <div className="flex items-start gap-3">
          {/* Médaillon matricule (disque frappé) */}
          <div className="relative grid h-12 w-12 shrink-0 place-items-center rounded-full text-[0.82rem] font-extrabold text-black/85" style={{ background: tone === "oxblood" ? "radial-gradient(circle at 32% 26%,#d06a62,#7c1d16)" : "radial-gradient(circle at 32% 26%,var(--brass-hi),color-mix(in srgb,var(--brass) 40%,#000))", boxShadow: `inset 0 0 0 2px color-mix(in srgb,${toneCol} 45%,#000), 0 2px 6px rgba(0,0,0,0.4)` }}>
            {initiales(m.nomIC)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate font-display text-[1.05rem] font-semibold leading-tight">{m.nomIC}</div>
                <div className="mt-0.5 flex items-center gap-1.5">
                  <span className="truncate text-[0.72rem] text-muted">{m.grade || "—"}</span>
                  <RankPips n={gradeRang(m.grade)} tone={toneCol} />
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span className="text-[0.56rem] tracking-[0.12em] text-faint" style={{ fontFamily: "'Courier New',monospace" }}>{matriculeFor(m)}</span>
                <Badge tone={STATUT_TONE[m.statut?.toLowerCase()] ?? "muted"}>{m.statut}</Badge>
              </div>
            </div>
            {(f.specialite || f.statutInterne || f.salaire || f.medecin) ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {f.specialite ? <Info icon={Target} label="Spécialité">{f.specialite}</Info> : null}
                {f.statutInterne ? <Info icon={BadgeCheck} label="Statut interne">{f.statutInterne}</Info> : null}
                {f.salaire ? <Info icon={BadgeDollarSign} label="Salaire">{cents(f.salaire)}$</Info> : null}
                {f.medecin ? <span title="Habilitation médecin" className="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[0.68rem] font-semibold" style={{ borderColor: "color-mix(in srgb,var(--good) 45%,var(--border))", background: "color-mix(in srgb,var(--good) 12%,transparent)", color: "var(--good)" }}><HeartPulse className="h-3 w-3" /> Médecin</span> : null}
              </div>
            ) : null}
            {f.notes ? <div className="mt-2 text-[0.72rem] leading-snug text-faint" style={clamp2}>{f.notes}</div> : null}
          </div>
          {peutEditer ? (
            <button onClick={() => setOpen(true)} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-border text-faint opacity-70 transition hover:border-accent hover:text-ink hover:opacity-100" aria-label="Éditer la fiche RH" title="Fiche RH">
              <Pencil className="h-[15px] w-[15px]" />
            </button>
          ) : null}
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
              <label className={"flex items-start gap-2.5 rounded-lg border border-border bg-surface-2 px-3 py-2.5 " + (peutHabiliterMedecin ? "cursor-pointer" : "cursor-not-allowed opacity-70")}>
                <input type="checkbox" checked={medecin} disabled={!peutHabiliterMedecin} onChange={(e) => setMedecin(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--accent)] disabled:cursor-not-allowed" />
                <span className="text-[0.82rem]"><b>Habilitation médecin</b><span className="mt-0.5 block text-[0.72rem] text-faint">Donne accès à l&apos;onglet Médical (dossiers de suivi). La Direction y a accès d&apos;office.{peutHabiliterMedecin ? "" : " Seule la Direction peut modifier cette habilitation."}</span></span>
              </label>
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
