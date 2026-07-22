"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, Plus, Loader2, Trash2, Building2 } from "lucide-react";
import { FDO_STATUTS, fdoStatut, money, type FDOData, type SoinFDO } from "@/lib/dispensaire-facturation-const";
import { Flash, inputCls } from "@/components/edit-ui";
import { creerSoin, majSoin, supprimerSoin } from "@/app/dispensaire/fdo/actions";

type FlashMsg = { t: "ok" | "bad"; m: string } | null;
const dtFR = (iso: string) => { try { return new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "short" }).format(new Date(iso)); } catch { return "—"; } };

export function DispensaireFDO({ data }: { data: FDOData }) {
  const router = useRouter();
  const [soins, setSoins] = useState<SoinFDO[]>(data.soins);
  const [flash, setFlash] = useState<FlashMsg>(null);
  const [busy, setBusy] = useState(false);
  const [v, setV] = useState({ bureau: "", agent: "", soin: "", montant: "0", statut: "offert" });
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV((p) => ({ ...p, [k]: e.target.value }));

  const bureaux = useMemo(() => {
    const m = new Map<string, { nb: number; total: number }>();
    for (const x of soins) { const e = m.get(x.bureau) || { nb: 0, total: 0 }; e.nb += 1; e.total += x.montant; m.set(x.bureau, e); }
    return [...m.entries()].map(([bureau, e]) => ({ bureau, ...e })).sort((a, b) => a.bureau.localeCompare(b.bureau));
  }, [soins]);
  const connus = useMemo(() => [...new Set(soins.map((s) => s.bureau))], [soins]);

  async function ajouter() {
    if (!v.bureau.trim()) { setFlash({ t: "bad", m: "Indique le bureau du shérif." }); return; }
    setBusy(true);
    const r = await creerSoin({ ...v, montant: Number(v.montant) || 0 });
    setBusy(false);
    if (!r.ok) { setFlash({ t: "bad", m: r.error || "Impossible." }); return; }
    const tmp: SoinFDO = { id: r.id || "tmp", bureau: v.bureau.trim(), agent: v.agent || null, soin: v.soin || null, montant: Number(v.montant) || 0, statut: v.statut, note: null, par: null, createdAt: new Date().toISOString() };
    setSoins((p) => [tmp, ...p]);
    setV({ bureau: v.bureau, agent: "", soin: "", montant: "0", statut: "offert" });
    setFlash({ t: "ok", m: "Soin enregistré." });
    router.refresh();
  }
  async function changerStatut(s: SoinFDO, statut: string) { setSoins((p) => p.map((x) => (x.id === s.id ? { ...x, statut } : x))); const r = await majSoin(s.id, { statut }); if (!r.ok) setFlash({ t: "bad", m: r.error || "Impossible." }); else router.refresh(); }
  async function supprimer(id: string) { setSoins((p) => p.filter((x) => x.id !== id)); const r = await supprimerSoin(id); if (!r.ok) setFlash({ t: "bad", m: r.error || "Impossible." }); else router.refresh(); }

  const parBureau = (b: string) => soins.filter((s) => s.bureau === b);

  return (
    <div className="flex flex-col gap-4">
      {!data.pret ? <Flash tone="bad">Lance <b>web/prisma/sql/dispensaire-facturation.sql</b> dans Supabase, puis recharge.</Flash> : null}
      {flash ? <Flash tone={flash.t === "ok" ? "good" : "bad"}>{flash.m}</Flash> : null}

      {/* Enregistrer un soin */}
      <section className="rounded-[14px] border border-border bg-surface p-4">
        <h3 className="mb-3 flex items-center gap-2 text-[0.9rem] font-semibold"><ShieldCheck className="h-4 w-4 text-accent" /> Soin aux forces de l&apos;ordre</h3>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <label className="flex flex-col gap-1"><span className="text-[0.7rem] uppercase tracking-[0.05em] text-faint">Bureau</span><input className={inputCls} value={v.bureau} onChange={set("bureau")} placeholder="Bureau du shérif de…" list="fdo-bureaux" /><datalist id="fdo-bureaux">{connus.map((b) => <option key={b} value={b} />)}</datalist></label>
          <label className="flex flex-col gap-1"><span className="text-[0.7rem] uppercase tracking-[0.05em] text-faint">Agent / shérif</span><input className={inputCls} value={v.agent} onChange={set("agent")} placeholder="Nom" /></label>
          <label className="flex flex-col gap-1 lg:col-span-2"><span className="text-[0.7rem] uppercase tracking-[0.05em] text-faint">Soin prodigué</span><input className={inputCls} value={v.soin} onChange={set("soin")} placeholder="Description" /></label>
          <label className="flex flex-col gap-1"><span className="text-[0.7rem] uppercase tracking-[0.05em] text-faint">Montant ($)</span><input className={inputCls} value={v.montant} onChange={(e) => setV((p) => ({ ...p, montant: e.target.value.replace(/[^0-9]/g, "") }))} inputMode="numeric" /></label>
          <label className="flex flex-col gap-1"><span className="text-[0.7rem] uppercase tracking-[0.05em] text-faint">Statut</span><select className={inputCls} value={v.statut} onChange={set("statut")}>{FDO_STATUTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</select></label>
          <div className="flex items-end justify-end lg:col-span-2"><button onClick={ajouter} disabled={busy} className="inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[0.8rem] font-semibold text-black/85 disabled:opacity-60" style={{ background: "var(--accent)" }}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Enregistrer</button></div>
        </div>
      </section>

      {/* Par bureau */}
      {bureaux.length ? (
        <div className="flex flex-wrap gap-2">
          {bureaux.map((b) => (
            <div key={b.bureau} className="flex items-center gap-2 rounded-[12px] border border-border bg-surface-2 px-3 py-2">
              <Building2 className="h-4 w-4 text-accent" />
              <div><div className="text-[0.82rem] font-semibold">{b.bureau}</div><div className="text-[0.68rem] text-faint">{b.nb} soin(s) · <span className="font-num">{money(b.total)}</span></div></div>
            </div>
          ))}
        </div>
      ) : null}

      {/* Liste groupée */}
      {soins.length === 0 ? <p className="px-1 py-10 text-center text-[0.85rem] italic text-faint">Aucun soin FDO enregistré.</p> : bureaux.map((b) => (
        <section key={b.bureau}>
          <div className="mb-1.5 flex items-center gap-1.5 text-[0.74rem] font-semibold uppercase tracking-[0.05em] text-faint"><Building2 className="h-3.5 w-3.5" /> {b.bureau}</div>
          <div className="flex flex-col gap-1.5">
            {parBureau(b.bureau).map((s) => {
              const st = fdoStatut(s.statut);
              return (
                <div key={s.id} className="group flex items-center gap-2 rounded-[10px] border border-border bg-surface-2 px-3 py-2 text-[0.8rem]">
                  <div className="min-w-0 flex-1">
                    <div className="truncate"><b className="font-semibold">{s.agent || "Agent"}</b>{s.soin ? <span className="text-faint"> · {s.soin}</span> : null}</div>
                    <div className="text-[0.68rem] text-faint">{dtFR(s.createdAt)}</div>
                  </div>
                  <span className="shrink-0 font-num text-muted">{money(s.montant)}</span>
                  <select value={s.statut} onChange={(e) => changerStatut(s, e.target.value)} className="shrink-0 rounded-md border border-border bg-surface px-1.5 py-1 text-[0.68rem] font-semibold" style={{ color: st.tone }}>{FDO_STATUTS.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}</select>
                  <button onClick={() => supprimer(s.id)} className="shrink-0 text-faint opacity-0 transition hover:text-oxblood group-hover:opacity-100" aria-label="Supprimer"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
