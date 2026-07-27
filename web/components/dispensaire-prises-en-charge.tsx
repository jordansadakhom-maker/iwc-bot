"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { HeartPulse, Loader2, Play, Check, X, UserPlus, Stethoscope, Clock, Plus, BadgeDollarSign, BedDouble } from "lucide-react";
import { Flash, inputCls } from "@/components/edit-ui";
import { ETAT_PEC_LABEL, type PrisesEnChargeData, type PriseEnCharge } from "@/lib/dispensaire-prises-en-charge-const";
import { admettre, attribuerMedecin, demarrerSoin, annulerPriseEnCharge, assignerChambrePEC } from "@/app/dispensaire/prises-en-charge/actions";
import { encaisserPriseEnCharge } from "@/app/dispensaire/factures/actions";
import { money } from "@/lib/dispensaire-facturation-const";
import { DispensairePecCloture } from "@/components/dispensaire-pec-cloture";

type FlashMsg = { t: "ok" | "bad"; m: string } | null;
const heureFR = (iso: string) => { try { return new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" }).format(new Date(iso)); } catch { return "—"; } };
function fmtMin(min: number) { if (min <= 0) return "à l'instant"; const h = Math.floor(min / 60), m = min % 60; return h ? `${h} h ${String(m).padStart(2, "0")}` : `${m} min`; }
const ETAT_TON: Record<string, string> = { admis: "var(--warn)", en_soin: "var(--accent)", termine: "var(--good)", annule: "var(--muted)" };

export function DispensairePrisesEnCharge({ data }: { data: PrisesEnChargeData }) {
  const router = useRouter();
  const [form, setForm] = useState({ patient: "", motif: "", medecin: "", note: "" });
  const [busy, setBusy] = useState(false);
  const [actif, setActif] = useState<string | null>(null);          // id en cours d'action
  const [flash, setFlash] = useState<FlashMsg>(null);
  const [med, setMed] = useState<Record<string, string>>({});        // saisie médecin par ligne
  const [clot, setClot] = useState<PriseEnCharge | null>(null);       // épisode en cours de clôture
  const [now, setNow] = useState<number | null>(null);
  const cleRef = useRef("");
  const jeton = () => (cleRef.current ||= (globalThis.crypto?.randomUUID?.() ?? String(Date.now()) + Math.random()));

  // Chrono live tant qu'il y a des prises en charge en cours.
  useEffect(() => {
    if (!data.enCours.length) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, [data.enCours.length]);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((p) => ({ ...p, [k]: e.target.value }));
  const depuis = (iso: string | null) => (iso && now != null ? fmtMin(Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000))) : "…");

  async function faire(id: string, fn: () => Promise<{ ok: boolean; error?: string }>, okMsg: string) {
    setActif(id);
    const r = await fn();
    setActif(null);
    if (!r.ok) { setFlash({ t: "bad", m: r.error || "Impossible." }); return; }
    setFlash({ t: "ok", m: okMsg });
    router.refresh();
  }

  async function admettreNouveau() {
    if (!form.patient.trim()) { setFlash({ t: "bad", m: "Indique le patient." }); return; }
    setBusy(true);
    const r = await admettre({ ...form, cle: jeton() });
    setBusy(false);
    if (!r.ok) { setFlash({ t: "bad", m: r.error || "Impossible." }); return; }
    cleRef.current = "";
    setForm({ patient: "", motif: "", medecin: "", note: "" });
    setFlash({ t: "ok", m: "Patient admis." });
    router.refresh();
  }

  if (!data.canEdit) return (
    <div className="rounded-[14px] border border-border bg-surface p-8 text-center">
      <HeartPulse className="mx-auto h-6 w-6 text-faint" />
      <p className="mt-2 text-[0.9rem] text-muted">Les prises en charge sont réservées au personnel du dispensaire.</p>
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      <datalist id="pec-patients">{data.patients.map((p) => <option key={p} value={p} />)}</datalist>
      <datalist id="pec-medecins">{data.medecins.map((m) => <option key={m} value={m} />)}</datalist>

      {!data.pret ? <Flash tone="bad">Lance <b>web/prisma/sql/dispensaire-prises-en-charge.sql</b> dans Supabase, puis recharge.</Flash> : null}
      {flash ? <Flash tone={flash.t === "ok" ? "good" : "bad"}>{flash.m}</Flash> : null}

      {/* Admission */}
      <section className="rounded-[14px] border border-border bg-surface p-4">
        <h3 className="mb-3 flex items-center gap-2 text-[0.9rem] font-semibold"><UserPlus className="h-4 w-4 text-accent" /> Admettre un patient</h3>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <label className="flex flex-col gap-1"><span className="text-[0.7rem] uppercase tracking-[0.05em] text-faint">Patient</span><input className={inputCls} list="pec-patients" value={form.patient} onChange={set("patient")} placeholder="Prénom Nom" /></label>
          <label className="flex flex-col gap-1"><span className="text-[0.7rem] uppercase tracking-[0.05em] text-faint">Motif</span><input className={inputCls} value={form.motif} onChange={set("motif")} placeholder="Blessure, consultation…" /></label>
          <label className="flex flex-col gap-1"><span className="text-[0.7rem] uppercase tracking-[0.05em] text-faint">Médecin (optionnel)</span><input className={inputCls} list="pec-medecins" value={form.medecin} onChange={set("medecin")} placeholder="À attribuer" /></label>
          <div className="flex items-end"><button onClick={admettreNouveau} disabled={busy || !data.pret} className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[0.8rem] font-semibold text-black/85 disabled:opacity-60" style={{ background: "var(--accent)" }}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Admettre</button></div>
        </div>
      </section>

      {/* En cours */}
      <section className="rounded-[14px] border border-border bg-surface p-4">
        <div className="mb-3 flex items-center gap-2">
          <h3 className="flex items-center gap-2 text-[0.9rem] font-semibold"><HeartPulse className="h-4 w-4 text-accent" /> Prises en charge en cours</h3>
          <span className="rounded-full px-2 py-0.5 text-[0.68rem] font-bold" style={{ color: data.enCours.length ? "var(--accent)" : "var(--faint)", background: data.enCours.length ? "color-mix(in srgb,var(--accent) 14%,transparent)" : "transparent" }}>{data.enCours.length}</span>
        </div>
        {data.enCours.length === 0 ? (
          <p className="py-6 text-center text-[0.85rem] italic text-faint">Aucun patient en cours de prise en charge.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {data.enCours.map((p) => <Carte key={p.id} p={p} />)}
          </div>
        )}
      </section>

      {/* Récentes */}
      {data.recentes.length ? (
        <section className="rounded-[14px] border border-border bg-surface p-4">
          <h3 className="mb-2 flex items-center gap-2 text-[0.9rem] font-semibold"><Clock className="h-4 w-4 text-faint" /> Terminées récemment</h3>
          <div className="flex flex-col divide-y divide-border/70">
            {data.recentes.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center gap-2 py-1.5 text-[0.82rem]">
                <span className="min-w-0 flex-1 truncate"><b className="font-semibold">{p.patient}</b>{p.motif ? <span className="text-faint"> · {p.motif}</span> : ""}{p.medecin ? <span className="text-faint"> · {p.medecin}</span> : ""}</span>
                {p.facture ? <span className="shrink-0 font-num text-[0.74rem]" style={{ color: p.facture.payee ? "var(--good)" : "var(--oxblood)" }}>{money(p.facture.montant)} · {p.facture.payee ? "réglé" : "impayé"}</span> : null}
                {p.facture && !p.facture.payee && data.canFacturer ? (
                  <button onClick={() => faire(p.id, () => encaisserPriseEnCharge(p.id), "Facture encaissée.")} disabled={actif === p.id} className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-border px-2 py-1 text-[0.7rem] font-semibold text-muted transition hover:text-ink disabled:opacity-50" style={{ borderColor: "color-mix(in srgb,var(--good) 40%,var(--border))" }}><BadgeDollarSign className="h-3 w-3" /> Encaisser</button>
                ) : null}
                <span className="shrink-0 rounded-full px-2 py-0.5 text-[0.66rem] font-bold" style={{ color: ETAT_TON[p.etat], background: `color-mix(in srgb,${ETAT_TON[p.etat]} 14%,transparent)` }}>{ETAT_PEC_LABEL[p.etat]}</span>
                <span className="shrink-0 font-num text-[0.72rem] text-faint">{heureFR(p.finAt || p.admisAt)}</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {clot ? <DispensairePecCloture pec={clot} onClose={() => setClot(null)} onDone={(f) => { setFlash(f); router.refresh(); }} /> : null}
    </div>
  );

  // Carte d'une prise en charge en cours (sous-composant pour accéder à l'état parent).
  function Carte({ p }: { p: PriseEnCharge }) {
    const busyRow = actif === p.id;
    return (
      <div className="rounded-[12px] border bg-surface-2 p-3" style={{ borderColor: `color-mix(in srgb,${ETAT_TON[p.etat]} 35%,var(--border))` }}>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="rounded-full px-2 py-0.5 text-[0.66rem] font-bold uppercase tracking-[0.04em]" style={{ color: ETAT_TON[p.etat], background: `color-mix(in srgb,${ETAT_TON[p.etat]} 14%,transparent)` }}>{ETAT_PEC_LABEL[p.etat]}</span>
          <span className="text-[0.9rem] font-semibold">{p.patient}</span>
          {p.motif ? <span className="text-[0.8rem] text-muted">· {p.motif}</span> : null}
          <span className="ml-auto flex items-center gap-1 whitespace-nowrap text-[0.72rem] text-faint"><Clock className="h-3 w-3" /> admis à {heureFR(p.admisAt)} · {depuis(p.admisAt)}{p.etat === "en_soin" && p.soinAt ? ` · en soin ${depuis(p.soinAt)}` : ""}</span>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          {/* Médecin assigné + réassignation inline */}
          <div className="flex items-center gap-1.5">
            <Stethoscope className="h-3.5 w-3.5 text-faint" />
            <input className={inputCls + " h-8 w-[150px] py-1 text-[0.78rem]"} list="pec-medecins" placeholder="Médecin…" value={med[p.id] ?? (p.medecin || "")} onChange={(e) => setMed((m) => ({ ...m, [p.id]: e.target.value }))} />
            <button onClick={() => faire(p.id, () => attribuerMedecin(p.id, med[p.id] ?? (p.medecin || "")), "Médecin attribué.")} disabled={busyRow} className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-[0.72rem] font-semibold text-muted transition hover:text-ink disabled:opacity-50">Assigner</button>
          </div>

          {/* Lit / chambre : affiché s'il est occupé, sinon sélecteur d'assignation */}
          {p.chambre ? (
            <span className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[0.72rem] font-semibold" style={{ color: "var(--good)", background: "color-mix(in srgb,var(--good) 12%,transparent)" }}><BedDouble className="h-3.5 w-3.5" /> {p.chambre.nom}</span>
          ) : data.chambresLibres.length ? (
            <div className="flex items-center gap-1"><BedDouble className="h-3.5 w-3.5 text-faint" /><select className={inputCls + " h-8 w-auto py-1 text-[0.74rem]"} value="" onChange={(e) => { if (e.target.value) faire(p.id, () => assignerChambrePEC(p.id, e.target.value), "Lit assigné."); }} aria-label="Assigner un lit"><option value="">Assigner un lit…</option>{data.chambresLibres.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}</select></div>
          ) : null}

          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            {p.etat === "admis" && data.canSoigner ? (
              <button onClick={() => faire(p.id, () => demarrerSoin(p.id), "Soin démarré.")} disabled={busyRow} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[0.74rem] font-semibold text-black/85 disabled:opacity-60" style={{ background: "var(--accent)" }}>{busyRow ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />} Démarrer le soin</button>
            ) : null}
            {data.canSoigner ? (
              <button onClick={() => setClot(p)} disabled={busyRow} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[0.74rem] font-semibold text-black/85 disabled:opacity-60" style={{ background: "var(--good)" }}><Check className="h-3.5 w-3.5" /> Terminer</button>
            ) : null}
            <button onClick={() => faire(p.id, () => annulerPriseEnCharge(p.id), "Prise en charge annulée.")} disabled={busyRow} className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1.5 text-[0.74rem] font-semibold text-muted transition hover:text-oxblood disabled:opacity-50"><X className="h-3.5 w-3.5" /> Annuler</button>
          </div>
        </div>
      </div>
    );
  }
}
