"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Sparkles, Lightbulb, ArrowRight, Info, ShieldCheck, Search, Play, Check, Archive, RotateCcw, Loader2, Flame } from "lucide-react";
import { resumeAuto, compterGravite, GRAVITE_TON, GRAVITE_LABEL, PRIORITE_LABEL, PRIORITE_TON, PRIORITE_ORDRE, ETAT_LABEL, ETAT_TON, ETATS, ETAT_ACTIFS, estEscalade, type AssistantData, type Constat, type Etat } from "@/lib/erp-assistant-const";

type SetEtat = (id: string, etat: Etat) => Promise<{ ok: boolean; error?: string }>;
const norm = (x: string) => x.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const ORDRE_G = ["critique", "important", "info"] as const;

export function AssistantPanel({ data, setEtat }: { data: AssistantData; setEtat?: SetEtat }) {
  const router = useRouter();
  const editable = !!setEtat;
  const [override, setOverride] = useState<Record<string, Etat>>({});
  const [q, setQ] = useState("");
  const [fEtat, setFEtat] = useState("");   // "" = seulement les actifs (Non lue + En cours)
  const [fPrio, setFPrio] = useState("");
  const [fCat, setFCat] = useState("");
  const [flash, setFlash] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const etatDe = (c: Constat): Etat => override[c.id] ?? c.etat ?? "nouveau";
  const all = data.constats.map((c) => ({ ...c, etat: etatDe(c) }));
  const actifs = all.filter((c) => ETAT_ACTIFS.includes(c.etat));
  const cats = [...new Set(data.constats.map((c) => c.categorie))].sort();
  const query = norm(q.trim());

  const liste = all
    .filter((c) => (fEtat ? c.etat === fEtat : ETAT_ACTIFS.includes(c.etat)))
    .filter((c) => (!fPrio || c.priorite === fPrio) && (!fCat || c.categorie === fCat))
    .filter((c) => !query || norm([c.titre, c.detail, c.categorie, c.suggestion].filter(Boolean).join(" ")).includes(query))
    .sort((a, b) => PRIORITE_ORDRE[a.priorite] - PRIORITE_ORDRE[b.priorite]);

  const resume = resumeAuto(actifs);
  const g = compterGravite(actifs);

  async function mark(c: Constat, etat: Etat) {
    if (!setEtat) return;
    setBusy(c.id + etat);
    setOverride((p) => ({ ...p, [c.id]: etat }));
    const r = await setEtat(c.id, etat);
    setBusy(null);
    if (!r.ok) { setOverride((p) => { const n = { ...p }; delete n[c.id]; return n; }); setFlash(r.error || "Impossible."); }
    else { setFlash(null); router.refresh(); }
  }

  return (
    <section className="flex flex-col gap-3">
      {/* Rapport auto */}
      <div className="flex items-start gap-3 rounded-[14px] border p-3.5" style={{ borderColor: "color-mix(in srgb,var(--accent) 30%,var(--border))", background: "color-mix(in srgb,var(--accent) 6%,transparent)" }}>
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] text-accent" style={{ background: "color-mix(in srgb,var(--accent) 15%,transparent)" }}><Sparkles className="h-[18px] w-[18px]" strokeWidth={1.8} /></span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <b className="text-[0.9rem]">Veille automatique</b>
            {data.genereLe ? <span className="text-[0.68rem] text-faint">· {data.genereLe}</span> : null}
            <span className="ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.68rem] font-bold" style={{ color: "var(--accent)", background: "color-mix(in srgb,var(--accent) 13%,transparent)" }}>{actifs.length} en cours</span>
          </div>
          <p className="mt-0.5 text-[0.85rem] text-muted">{resume}</p>
          {actifs.length ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {ORDRE_G.map((gr) => g[gr] ? <span key={gr} className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.68rem] font-bold" style={{ color: GRAVITE_TON[gr], background: `color-mix(in srgb,${GRAVITE_TON[gr]} 13%,transparent)` }}>{g[gr]} {GRAVITE_LABEL[gr]}</span> : null)}
            </div>
          ) : null}
        </div>
      </div>

      {flash ? <p className="rounded-[12px] border px-3 py-2 text-[0.8rem]" style={{ borderColor: "color-mix(in srgb,var(--oxblood) 45%,var(--border))", color: "var(--oxblood)" }}>{flash}</p> : null}
      {!data.pret ? <p className="rounded-[12px] border border-border bg-surface-2 px-3 py-2 text-[0.78rem] text-faint">Les données ne sont pas encore accessibles — la veille s&apos;activera dès qu&apos;elles le seront.</p> : null}

      {/* Filtres */}
      {data.constats.length ? (
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[170px] flex-1"><Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" /><input className="w-full rounded-lg border border-border bg-surface px-3 py-2 pl-8 text-[0.85rem] outline-none focus:border-border-2" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher…" /></div>
          <select className="rounded-lg border border-border bg-surface px-2 py-2 text-[0.8rem]" value={fEtat} onChange={(e) => setFEtat(e.target.value)}><option value="">Actives (non lues + en cours)</option>{ETATS.map((e) => <option key={e} value={e}>{ETAT_LABEL[e]}</option>)}</select>
          <select className="rounded-lg border border-border bg-surface px-2 py-2 text-[0.8rem]" value={fPrio} onChange={(e) => setFPrio(e.target.value)}><option value="">Toutes priorités</option>{(Object.keys(PRIORITE_ORDRE) as (keyof typeof PRIORITE_ORDRE)[]).map((p) => <option key={p} value={p}>{PRIORITE_LABEL[p]}</option>)}</select>
          {cats.length > 1 ? <select className="rounded-lg border border-border bg-surface px-2 py-2 text-[0.8rem]" value={fCat} onChange={(e) => setFCat(e.target.value)}><option value="">Toutes catégories</option>{cats.map((c) => <option key={c} value={c}>{c}</option>)}</select> : null}
        </div>
      ) : null}

      {/* Liste */}
      {liste.length === 0 ? (
        data.pret ? <div className="flex items-center gap-2.5 rounded-[14px] border border-border bg-surface p-4 text-[0.85rem] text-muted"><ShieldCheck className="h-5 w-5" style={{ color: "var(--good)" }} /> {fEtat || fPrio || fCat || query ? "Aucune notification ne correspond à ces filtres." : "Tout est sous contrôle — aucun point d'attention actif."}</div> : null
      ) : (
        <div className="flex flex-col gap-1.5">
          {liste.map((c) => {
            const escalade = estEscalade(c);
            const clos = c.etat === "resolu" || c.etat === "archive";
            return (
              <div key={c.id} className="flex flex-wrap items-start gap-3 rounded-[12px] border bg-surface p-3" style={{ borderColor: `color-mix(in srgb,${GRAVITE_TON[c.gravite]} 28%,var(--border))`, opacity: clos ? 0.7 : 1 }}>
                <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: GRAVITE_TON[c.gravite], boxShadow: `0 0 0 3px color-mix(in srgb,${GRAVITE_TON[c.gravite]} 16%,transparent)` }} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="rounded-full px-1.5 py-0.5 text-[0.58rem] font-bold uppercase" style={{ color: PRIORITE_TON[c.priorite], background: `color-mix(in srgb,${PRIORITE_TON[c.priorite]} 14%,transparent)` }}>{PRIORITE_LABEL[c.priorite]}</span>
                    <span className="rounded-full border border-border px-1.5 py-0.5 text-[0.58rem] font-bold uppercase text-faint">{c.categorie}</span>
                    {escalade ? <span className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[0.58rem] font-bold text-white" style={{ background: "var(--oxblood)" }}><Flame className="h-2.5 w-2.5" /> à escalader</span> : null}
                    <span className="ml-auto rounded-full px-1.5 py-0.5 text-[0.58rem] font-bold uppercase" style={{ color: ETAT_TON[c.etat], background: `color-mix(in srgb,${ETAT_TON[c.etat]} 14%,transparent)` }}>{ETAT_LABEL[c.etat]}</span>
                  </div>
                  <div className="mt-1 text-[0.88rem] font-semibold">{c.titre}</div>
                  {c.detail ? <div className="mt-0.5 text-[0.74rem] text-faint">{c.detail}</div> : null}
                  <div className="mt-1 flex items-start gap-1.5 text-[0.78rem] text-muted"><Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: "var(--warn)" }} /> {c.suggestion}</div>
                  {/* Actions d'état */}
                  {editable ? (
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      {!clos ? (
                        <>
                          {c.etat !== "en_cours" ? <EtatBtn on={() => mark(c, "en_cours")} busy={busy === c.id + "en_cours"} icon={Play} tone="var(--warn)">En cours</EtatBtn> : null}
                          <EtatBtn on={() => mark(c, "resolu")} busy={busy === c.id + "resolu"} icon={Check} tone="var(--good)">Résolu</EtatBtn>
                          <EtatBtn on={() => mark(c, "archive")} busy={busy === c.id + "archive"} icon={Archive} tone="var(--muted)">Archiver</EtatBtn>
                        </>
                      ) : (
                        <EtatBtn on={() => mark(c, "nouveau")} busy={busy === c.id + "nouveau"} icon={RotateCcw} tone="var(--accent)">Rouvrir</EtatBtn>
                      )}
                    </div>
                  ) : null}
                </div>
                <Link href={c.href} className="group inline-flex shrink-0 items-center gap-1 self-center rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-[0.74rem] font-semibold text-muted transition hover:text-ink">Voir <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" /></Link>
              </div>
            );
          })}
        </div>
      )}

      {editable ? <p className="flex items-center gap-1.5 text-[0.68rem] text-faint"><Info className="h-3 w-3" /> Marque une notification <b>En cours</b> quand tu la prends en charge, <b>Résolue</b> une fois traitée, <b>Archivée</b> pour la ranger. Les points critiques non lus sont signalés « à escalader ».</p> : null}
    </section>
  );
}

function EtatBtn({ on, busy, icon: Icon, tone, children }: { on: () => void; busy: boolean; icon: typeof Play; tone: string; children: React.ReactNode }) {
  return (
    <button onClick={on} disabled={busy} className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[0.72rem] font-semibold transition hover:brightness-110 disabled:opacity-50" style={{ borderColor: `color-mix(in srgb,${tone} 40%,var(--border))`, color: tone }}>
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Icon className="h-3.5 w-3.5" />} {children}
    </button>
  );
}
