"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Scissors, Plus, Loader2, Play, Check, X, Trash2, Stethoscope, ClipboardCheck, ClipboardList } from "lucide-react";
import { Flash, inputCls } from "@/components/edit-ui";
import { STATUT_INTERV_LABEL, type InterventionsData, type Intervention } from "@/lib/dispensaire-interventions-const";
import { creerIntervention, demarrerIntervention, annulerIntervention, supprimerIntervention } from "@/app/dispensaire/interventions/actions";
import { DispensaireInterventionCRO } from "@/components/dispensaire-intervention-cro";

type FlashMsg = { t: "ok" | "bad"; m: string } | null;
const dtFR = (iso: string | null) => { if (!iso) return "—"; try { return new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso)); } catch { return "—"; } };
const STATUT_TON: Record<string, string> = { planifiee: "var(--warn)", en_cours: "var(--accent)", terminee: "var(--good)", annulee: "var(--muted)" };

export function DispensaireInterventions({ data }: { data: InterventionsData }) {
  const router = useRouter();
  const [flash, setFlash] = useState<FlashMsg>(null);
  const [busy, setBusy] = useState(false);
  const [actif, setActif] = useState<string | null>(null);
  const [form, setForm] = useState({ patient: "", type: "", chirurgien: "", assistants: "", salle: "" });
  const [cro, setCro] = useState<{ interv: Intervention; mode: "terminer" | "editer" } | null>(null);
  const cleRef = useRef("");
  const jeton = () => (cleRef.current ||= (globalThis.crypto?.randomUUID?.() ?? String(Date.now()) + Math.random()));
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((p) => ({ ...p, [k]: e.target.value }));

  async function creer() {
    if (!form.patient.trim()) { setFlash({ t: "bad", m: "Indique le patient." }); return; }
    setBusy(true);
    const r = await creerIntervention({ ...form, cle: jeton() });
    setBusy(false);
    if (!r.ok) { setFlash({ t: "bad", m: r.error || "Impossible." }); return; }
    cleRef.current = "";
    setForm({ patient: "", type: "", chirurgien: "", assistants: "", salle: "" });
    setFlash({ t: "ok", m: "Intervention planifiée." });
    router.refresh();
  }

  async function faire(id: string, fn: () => Promise<{ ok: boolean; error?: string }>, okMsg: string) {
    setActif(id);
    const r = await fn();
    setActif(null);
    if (!r.ok) { setFlash({ t: "bad", m: r.error || "Impossible." }); return; }
    setFlash({ t: "ok", m: okMsg });
    router.refresh();
  }

  if (!data.canEdit && data.pret) return (
    <div className="rounded-[14px] border border-border bg-surface p-8 text-center">
      <Scissors className="mx-auto h-6 w-6 text-faint" />
      <p className="mt-2 text-[0.9rem] text-muted">Les interventions sont réservées au personnel soignant.</p>
    </div>
  );

  const Carte = (i: Intervention, actions: boolean) => (
    <div key={i.id} className="rounded-[12px] border bg-surface-2 p-3" style={{ borderColor: `color-mix(in srgb,${STATUT_TON[i.statut]} 30%,var(--border))` }}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="rounded-full px-2 py-0.5 text-[0.64rem] font-bold uppercase tracking-[0.04em]" style={{ color: STATUT_TON[i.statut], background: `color-mix(in srgb,${STATUT_TON[i.statut]} 14%,transparent)` }}>{STATUT_INTERV_LABEL[i.statut]}</span>
        <span className="text-[0.9rem] font-semibold">{i.patient}</span>
        {i.type ? <span className="text-[0.8rem] text-muted">· {i.type}</span> : null}
        {i.chirurgien ? <span className="inline-flex items-center gap-0.5 text-[0.78rem] text-faint"><Stethoscope className="h-3 w-3" /> {i.chirurgien}</span> : null}
        <span className="ml-auto text-[0.72rem] text-faint">{i.debut ? `${dtFR(i.debut)}${i.fin ? ` → ${dtFR(i.fin)}` : ""}` : dtFR(i.createdAt)}</span>
      </div>
      {(i.soinsRealises || i.complications || i.compteRendu) ? (
        <div className="mt-1.5 flex flex-col gap-0.5 text-[0.78rem] text-muted">
          {i.soinsRealises ? <div><span className="text-faint">Gestes :</span> {i.soinsRealises}</div> : null}
          {i.complications ? <div><span className="text-faint">Complications :</span> {i.complications}</div> : null}
          {i.compteRendu ? <div><span className="text-faint">CRO :</span> {i.compteRendu}</div> : null}
        </div>
      ) : null}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {actions && i.statut === "planifiee" ? <button onClick={() => faire(i.id, () => demarrerIntervention(i.id), "Intervention démarrée.")} disabled={actif === i.id} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[0.74rem] font-semibold text-black/85 disabled:opacity-60" style={{ background: "var(--accent)" }}><Play className="h-3.5 w-3.5" /> Démarrer</button> : null}
        {actions ? <button onClick={() => setCro({ interv: i, mode: "terminer" })} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[0.74rem] font-semibold text-black/85" style={{ background: "var(--good)" }}><Check className="h-3.5 w-3.5" /> Terminer</button> : null}
        <button onClick={() => setCro({ interv: i, mode: "editer" })} className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1.5 text-[0.74rem] font-semibold text-muted hover:text-ink"><ClipboardCheck className="h-3.5 w-3.5" /> CRO</button>
        {actions ? <button onClick={() => faire(i.id, () => annulerIntervention(i.id), "Intervention annulée.")} disabled={actif === i.id} className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1.5 text-[0.74rem] font-semibold text-muted hover:text-oxblood disabled:opacity-50"><X className="h-3.5 w-3.5" /> Annuler</button> : null}
        <button onClick={() => faire(i.id, () => supprimerIntervention(i.id), "Intervention supprimée.")} disabled={actif === i.id} className="ml-auto inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1.5 text-[0.72rem] font-semibold text-muted hover:text-oxblood disabled:opacity-50"><Trash2 className="h-3.5 w-3.5" /></button>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      <datalist id="interv-patients">{data.patients.map((p) => <option key={p} value={p} />)}</datalist>
      <datalist id="interv-medecins">{data.medecins.map((m) => <option key={m} value={m} />)}</datalist>

      {!data.pret ? <Flash tone="bad">Lance <b>web/prisma/sql/dispensaire-interventions.sql</b> dans Supabase, puis recharge.</Flash> : null}
      {flash ? <Flash tone={flash.t === "ok" ? "good" : "bad"}>{flash.m}</Flash> : null}

      {data.canEdit ? (
        <section className="rounded-[14px] border border-border bg-surface p-4">
          <h3 className="mb-3 flex items-center gap-2 text-[0.9rem] font-semibold"><Plus className="h-4 w-4 text-accent" /> Planifier une intervention</h3>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <label className="flex flex-col gap-1"><span className="text-[0.7rem] uppercase tracking-[0.05em] text-faint">Patient</span><input className={inputCls} list="interv-patients" value={form.patient} onChange={set("patient")} placeholder="Prénom Nom" /></label>
            <label className="flex flex-col gap-1"><span className="text-[0.7rem] uppercase tracking-[0.05em] text-faint">Type</span><input className={inputCls} value={form.type} onChange={set("type")} placeholder="Suture, extraction…" /></label>
            <label className="flex flex-col gap-1"><span className="text-[0.7rem] uppercase tracking-[0.05em] text-faint">Chirurgien</span><input className={inputCls} list="interv-medecins" value={form.chirurgien} onChange={set("chirurgien")} placeholder="Dr…" /></label>
            <label className="flex flex-col gap-1"><span className="text-[0.7rem] uppercase tracking-[0.05em] text-faint">Assistants</span><input className={inputCls} value={form.assistants} onChange={set("assistants")} placeholder="Personnel" /></label>
            <label className="flex flex-col gap-1"><span className="text-[0.7rem] uppercase tracking-[0.05em] text-faint">Salle</span><input className={inputCls} value={form.salle} onChange={set("salle")} placeholder="Bloc…" /></label>
            <div className="flex items-end"><button onClick={creer} disabled={busy || !data.pret} className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[0.8rem] font-semibold text-black/85 disabled:opacity-60" style={{ background: "var(--accent)" }}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Planifier</button></div>
          </div>
        </section>
      ) : null}

      <section className="rounded-[14px] border border-border bg-surface p-4">
        <div className="mb-3 flex items-center gap-2">
          <h3 className="flex items-center gap-2 text-[0.9rem] font-semibold"><Scissors className="h-4 w-4 text-accent" /> En cours &amp; planifiées</h3>
          <span className="rounded-full px-2 py-0.5 text-[0.68rem] font-bold" style={{ color: data.enCours.length ? "var(--accent)" : "var(--faint)", background: data.enCours.length ? "color-mix(in srgb,var(--accent) 14%,transparent)" : "transparent" }}>{data.enCours.length}</span>
        </div>
        {data.enCours.length === 0 ? <p className="py-6 text-center text-[0.85rem] italic text-faint">Aucune intervention en cours.</p> : <div className="flex flex-col gap-2">{data.enCours.map((i) => Carte(i, data.canEdit))}</div>}
      </section>

      {data.recentes.length ? (
        <section className="rounded-[14px] border border-border bg-surface p-4">
          <h3 className="mb-2 flex items-center gap-2 text-[0.9rem] font-semibold"><ClipboardList className="h-4 w-4 text-faint" /> Terminées récemment</h3>
          <div className="flex flex-col gap-2">{data.recentes.map((i) => Carte(i, false))}</div>
        </section>
      ) : null}

      {cro ? <DispensaireInterventionCRO interv={cro.interv} mode={cro.mode} onClose={() => setCro(null)} onDone={(f) => { setFlash(f); router.refresh(); }} /> : null}
    </div>
  );
}
