"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, RefreshCw, Lock, AlertTriangle, CheckCircle2, ListChecks, Loader2 } from "lucide-react";
import { GRAVITE_LABEL, GRAVITE_TON, tonScore, type RapportAudit, type Anomalie } from "@/lib/audit-core";

const heureFR = (iso: string) => { try { return new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(new Date(iso)); } catch { return "—"; } };

function Jauge({ label, score, sous }: { label: string; score: number; sous?: string }) {
  const ton = tonScore(score);
  return (
    <div className="rounded-[12px] border border-border bg-surface-2 p-3">
      <div className="flex items-baseline justify-between"><span className="text-[0.74rem] font-semibold text-faint">{label}</span><span className="font-num text-[1.15rem] font-bold" style={{ color: ton }}>{score}%</span></div>
      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-surface"><div className="h-full rounded-full transition-all" style={{ width: `${score}%`, background: ton }} /></div>
      {sous ? <div className="mt-1 text-[0.68rem] text-faint">{sous}</div> : null}
    </div>
  );
}

function LigneAnomalie({ a }: { a: Anomalie }) {
  const ton = GRAVITE_TON[a.gravite];
  return (
    <div className="flex gap-2.5 rounded-[10px] border border-border bg-surface-2 px-3 py-2.5">
      <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full" style={{ background: ton }} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[0.84rem] font-semibold">{a.titre}</span>
          <span className="rounded-full px-1.5 py-0.5 text-[0.6rem] font-semibold uppercase" style={{ background: `color-mix(in srgb,${ton} 16%,transparent)`, color: ton }}>{GRAVITE_LABEL[a.gravite]}</span>
          <span className="text-[0.68rem] text-faint">{a.categorie}</span>
        </div>
        <div className="text-[0.78rem] text-muted">{a.detail}</div>
        {a.suggestion ? <div className="mt-0.5 text-[0.72rem] text-faint">💡 {a.suggestion}</div> : null}
      </div>
    </div>
  );
}

function Checklist({ items, cle }: { items: RapportAudit["checklist"]; cle: string }) {
  const [coches, setCoches] = useState<Record<string, boolean>>({});
  useEffect(() => { try { const r = localStorage.getItem(cle); if (r) setCoches(JSON.parse(r)); } catch { /* ignore */ } }, [cle]);
  const toggle = (id: string) => setCoches((p) => { const n = { ...p, [id]: !p[id] }; try { localStorage.setItem(cle, JSON.stringify(n)); } catch { /* ignore */ } return n; });
  const groupes = [...new Set(items.map((i) => i.groupe))];
  const faits = items.filter((i) => coches[i.id]).length;
  return (
    <section className="rounded-[14px] border border-border bg-surface p-4">
      <div className="mb-3 flex items-center gap-2">
        <ListChecks className="h-4 w-4 text-accent" />
        <h3 className="text-[0.9rem] font-semibold">Checklist des tests manuels</h3>
        <span className="ml-auto font-num text-[0.78rem] text-faint">{faits}/{items.length}</span>
      </div>
      <div className="flex flex-col gap-3">
        {groupes.map((g) => (
          <div key={g}>
            <div className="mb-1 text-[0.7rem] font-semibold uppercase tracking-wide text-faint">{g}</div>
            <div className="flex flex-col gap-1">
              {items.filter((i) => i.groupe === g).map((i) => (
                <label key={i.id} className="flex cursor-pointer items-start gap-2 rounded-md px-1.5 py-1 text-[0.82rem] hover:bg-surface-2">
                  <input type="checkbox" checked={!!coches[i.id]} onChange={() => toggle(i.id)} className="mt-0.5 h-3.5 w-3.5 accent-[var(--accent)]" />
                  <span className={coches[i.id] ? "text-faint line-through" : ""}>{i.libelle}</span>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function AuditView({ data, cle = "audit-checklist" }: { data: RapportAudit; cle?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  if (!data.canVoir) return (
    <div className="rounded-[14px] border border-border bg-surface p-8 text-center">
      <Lock className="mx-auto h-6 w-6 text-faint" />
      <p className="mt-2 text-[0.9rem] text-muted">Le mode audit est réservé à l&apos;administration.</p>
    </div>
  );

  const relancer = () => { setBusy(true); router.refresh(); setTimeout(() => setBusy(false), 1200); };
  const critiques = data.anomalies.filter((a) => a.gravite === "critique").length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="flex items-center gap-2 font-display text-[1.15rem]"><ShieldCheck className="h-5 w-5 text-accent" /> Mode Audit</h2>
        <span className="text-[0.72rem] text-faint">{data.totalControles} contrôles · {heureFR(data.genereLe)}</span>
        <button onClick={relancer} disabled={busy} className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-[0.78rem] font-semibold hover:border-accent disabled:opacity-60">{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Relancer l&apos;audit</button>
      </div>

      {!data.pret ? <div className="rounded-xl border px-4 py-3 text-[0.82rem]" style={{ borderColor: "color-mix(in srgb,var(--oxblood) 40%,var(--border))", background: "color-mix(in srgb,var(--oxblood) 10%,transparent)" }}>Base inaccessible — impossible de lancer les contrôles.</div> : null}

      {/* Score global + catégories */}
      <div className="rounded-[14px] border border-border bg-surface p-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="grid h-16 w-16 place-items-center rounded-full border-4" style={{ borderColor: tonScore(data.scoreGlobal) }}>
              <span className="font-num text-[1.25rem] font-bold" style={{ color: tonScore(data.scoreGlobal) }}>{data.scoreGlobal}</span>
            </div>
            <div>
              <div className="text-[0.9rem] font-semibold">Santé globale</div>
              <div className="text-[0.76rem] text-faint">{data.anomalies.length} anomalie(s){critiques ? ` · ${critiques} critique(s)` : ""}</div>
            </div>
          </div>
          <div className="grid flex-1 grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {data.categories.map((c) => <Jauge key={c.categorie} label={c.categorie} score={c.score} sous={`${c.anomalies} anomalie(s)`} />)}
          </div>
        </div>
      </div>

      {/* Anomalies */}
      <section className="rounded-[14px] border border-border bg-surface p-4">
        <div className="mb-3 flex items-center gap-2">
          {data.anomalies.length ? <AlertTriangle className="h-4 w-4 text-warn" /> : <CheckCircle2 className="h-4 w-4 text-good" />}
          <h3 className="text-[0.9rem] font-semibold">Anomalies détectées <span className="font-num text-[0.8rem] text-faint">{data.anomalies.length}</span></h3>
        </div>
        {data.anomalies.length === 0 ? (
          <p className="py-6 text-center text-[0.85rem] text-good">✓ Aucune anomalie — tout est cohérent.</p>
        ) : (
          <div className="flex flex-col gap-2">{data.anomalies.map((a, i) => <LigneAnomalie key={i} a={a} />)}</div>
        )}
      </section>

      <Checklist items={data.checklist} cle={cle} />
    </div>
  );
}
