"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BedDouble, Plus, Loader2, Trash2, Stethoscope, UserPlus, LogOut, Check, X } from "lucide-react";
import { Flash, inputCls } from "@/components/edit-ui";
import { ETAT_CHAMBRE_LABEL, ETAT_CHAMBRE_TON, ETATS_CHAMBRE, type ChambresData, type Chambre } from "@/lib/dispensaire-chambres-const";
import { creerChambre, occuperChambre, libererChambre, changerEtatChambre, supprimerChambre } from "@/app/dispensaire/chambres/actions";

type FlashMsg = { t: "ok" | "bad"; m: string } | null;
const heureFR = (iso: string | null) => { if (!iso) return "—"; try { return new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso)); } catch { return "—"; } };

export function DispensaireChambres({ data }: { data: ChambresData }) {
  const router = useRouter();
  const [flash, setFlash] = useState<FlashMsg>(null);
  const [busy, setBusy] = useState(false);
  const [actif, setActif] = useState<string | null>(null);
  const [form, setForm] = useState({ nom: "", type: "" });
  const [occ, setOcc] = useState<string | null>(null);
  const [occForm, setOccForm] = useState({ patient: "", medecin: "" });
  const cleRef = useRef("");
  const jeton = () => (cleRef.current ||= (globalThis.crypto?.randomUUID?.() ?? String(Date.now()) + Math.random()));

  async function creer() {
    if (!form.nom.trim()) { setFlash({ t: "bad", m: "Donne un nom / numéro." }); return; }
    setBusy(true);
    const r = await creerChambre({ ...form, cle: jeton() });
    setBusy(false);
    if (!r.ok) { setFlash({ t: "bad", m: r.error || "Impossible." }); return; }
    cleRef.current = ""; setForm({ nom: "", type: "" }); setFlash({ t: "ok", m: "Chambre ajoutée." }); router.refresh();
  }

  async function faire(id: string, fn: () => Promise<{ ok: boolean; error?: string }>, okMsg: string) {
    setActif(id);
    const r = await fn();
    setActif(null);
    if (!r.ok) { setFlash({ t: "bad", m: r.error || "Impossible." }); return; }
    setFlash({ t: "ok", m: okMsg }); router.refresh();
  }

  async function valoccuper(id: string) {
    if (!occForm.patient.trim()) { setFlash({ t: "bad", m: "Indique le patient." }); return; }
    setActif(id);
    const r = await occuperChambre(id, occForm);
    setActif(null);
    if (!r.ok) { setFlash({ t: "bad", m: r.error || "Impossible." }); return; }
    setOcc(null); setOccForm({ patient: "", medecin: "" }); setFlash({ t: "ok", m: "Chambre occupée." }); router.refresh();
  }

  if (!data.canEdit) return (
    <div className="rounded-[14px] border border-border bg-surface p-8 text-center">
      <BedDouble className="mx-auto h-6 w-6 text-faint" />
      <p className="mt-2 text-[0.9rem] text-muted">La gestion des chambres est réservée au personnel du dispensaire.</p>
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      <datalist id="ch-patients">{data.patients.map((p) => <option key={p} value={p} />)}</datalist>
      <datalist id="ch-medecins">{data.medecins.map((m) => <option key={m} value={m} />)}</datalist>

      {!data.pret ? <Flash tone="bad">Lance <b>web/prisma/sql/dispensaire-chambres.sql</b> dans Supabase, puis recharge.</Flash> : null}
      {flash ? <Flash tone={flash.t === "ok" ? "good" : "bad"}>{flash.m}</Flash> : null}

      {/* Synthèse */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {(ETATS_CHAMBRE).map((e) => (
          <div key={e} className="rounded-[12px] border border-border bg-surface p-3 text-center">
            <div className="font-num text-[1.5rem] font-bold" style={{ color: ETAT_CHAMBRE_TON[e] }}>{data.stats[e]}</div>
            <div className="text-[0.72rem] text-faint">{ETAT_CHAMBRE_LABEL[e]}</div>
          </div>
        ))}
      </div>

      {/* Ajout */}
      <section className="rounded-[14px] border border-border bg-surface p-4">
        <h3 className="mb-3 flex items-center gap-2 text-[0.9rem] font-semibold"><Plus className="h-4 w-4 text-accent" /> Ajouter une chambre / un lit</h3>
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-1 flex-col gap-1"><span className="text-[0.7rem] uppercase tracking-[0.05em] text-faint">Nom / numéro</span><input className={inputCls} value={form.nom} onChange={(e) => setForm((p) => ({ ...p, nom: e.target.value }))} placeholder="Ex. Lit 1, Box A…" /></label>
          <label className="flex flex-1 flex-col gap-1"><span className="text-[0.7rem] uppercase tracking-[0.05em] text-faint">Type</span><input className={inputCls} value={form.type} onChange={(e) => setForm((p) => ({ ...p, type: e.target.value }))} placeholder="Standard, soins intensifs…" /></label>
          <button onClick={creer} disabled={busy || !data.pret} className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[0.8rem] font-semibold text-black/85 disabled:opacity-60" style={{ background: "var(--accent)" }}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Ajouter</button>
        </div>
      </section>

      {/* Grille */}
      {data.chambres.length === 0 ? (
        <p className="py-6 text-center text-[0.85rem] italic text-faint">Aucune chambre — ajoute-en pour gérer l&apos;hospitalisation.</p>
      ) : (
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {data.chambres.map((c) => <Carte key={c.id} c={c} />)}
        </div>
      )}
    </div>
  );

  function Carte({ c }: { c: Chambre }) {
    const ton = ETAT_CHAMBRE_TON[c.etat];
    const busyRow = actif === c.id;
    return (
      <div className="flex flex-col rounded-[12px] border bg-surface p-3" style={{ borderColor: `color-mix(in srgb,${ton} 40%,var(--border))` }}>
        <div className="flex items-center gap-2">
          <BedDouble className="h-4 w-4 shrink-0" style={{ color: ton }} />
          <span className="text-[0.92rem] font-semibold">{c.nom}</span>
          {c.type ? <span className="text-[0.72rem] text-faint">{c.type}</span> : null}
          <span className="ml-auto rounded-full px-2 py-0.5 text-[0.64rem] font-bold uppercase" style={{ color: ton, background: `color-mix(in srgb,${ton} 14%,transparent)` }}>{ETAT_CHAMBRE_LABEL[c.etat]}</span>
        </div>

        {c.etat === "occupee" ? (
          <div className="mt-1.5 text-[0.8rem]"><b className="font-semibold">{c.patient}</b>{c.medecin ? <span className="inline-flex items-center gap-0.5 text-faint"> · <Stethoscope className="h-3 w-3" />{c.medecin}</span> : null}<div className="text-[0.7rem] text-faint">depuis {heureFR(c.depuis)}</div></div>
        ) : null}

        {occ === c.id ? (
          <div className="mt-2 flex flex-col gap-1.5">
            <input className={inputCls + " h-8 py-1 text-[0.8rem]"} list="ch-patients" value={occForm.patient} onChange={(e) => setOccForm((p) => ({ ...p, patient: e.target.value }))} placeholder="Patient…" autoFocus />
            <input className={inputCls + " h-8 py-1 text-[0.8rem]"} list="ch-medecins" value={occForm.medecin} onChange={(e) => setOccForm((p) => ({ ...p, medecin: e.target.value }))} placeholder="Médecin (optionnel)" />
            <div className="flex gap-1.5">
              <button onClick={() => valoccuper(c.id)} disabled={busyRow} className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-[0.74rem] font-semibold text-black/85 disabled:opacity-60" style={{ background: "var(--oxblood)", color: "#fff" }}>{busyRow ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Occuper</button>
              <button onClick={() => { setOcc(null); setOccForm({ patient: "", medecin: "" }); }} className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1.5 text-[0.74rem] font-semibold text-muted hover:text-ink"><X className="h-3.5 w-3.5" /></button>
            </div>
          </div>
        ) : (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {c.etat === "occupee" ? (
              <button onClick={() => faire(c.id, () => libererChambre(c.id), "Chambre libérée (à nettoyer).")} disabled={busyRow} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[0.74rem] font-semibold text-black/85 disabled:opacity-60" style={{ background: "var(--good)" }}><LogOut className="h-3.5 w-3.5" /> Libérer</button>
            ) : (
              <button onClick={() => { setOcc(c.id); setOccForm({ patient: "", medecin: "" }); }} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[0.74rem] font-semibold text-black/85" style={{ background: "var(--oxblood)", color: "#fff" }}><UserPlus className="h-3.5 w-3.5" /> Occuper</button>
            )}
            <select className={inputCls + " h-8 w-auto py-1 text-[0.74rem]"} value="" onChange={(e) => { if (e.target.value) faire(c.id, () => changerEtatChambre(c.id, e.target.value), "État mis à jour."); }} aria-label="Changer l'état">
              <option value="">État…</option>
              {ETATS_CHAMBRE.filter((e) => e !== "occupee" && e !== c.etat).map((e) => <option key={e} value={e}>{ETAT_CHAMBRE_LABEL[e]}</option>)}
            </select>
            <button onClick={() => faire(c.id, () => supprimerChambre(c.id), "Chambre supprimée.")} disabled={busyRow} className="ml-auto inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1.5 text-[0.72rem] font-semibold text-muted transition hover:text-oxblood disabled:opacity-50"><Trash2 className="h-3.5 w-3.5" /></button>
          </div>
        )}
      </div>
    );
  }
}
