"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Truck, Plus, Loader2, Trash2, Fuel, Wrench, Pencil, Check, X, Gauge } from "lucide-react";
import { Flash, inputCls } from "@/components/edit-ui";
import { ETAT_AMBULANCE_LABEL, ETAT_AMBULANCE_TON, ETATS_AMBULANCE, type AmbulancesData, type Ambulance } from "@/lib/dispensaire-ambulances-const";
import { creerAmbulance, changerEtatAmbulance, majAmbulance, supprimerAmbulance } from "@/app/dispensaire/ambulances/actions";

type FlashMsg = { t: "ok" | "bad"; m: string } | null;

export function DispensaireAmbulances({ data }: { data: AmbulancesData }) {
  const router = useRouter();
  const [flash, setFlash] = useState<FlashMsg>(null);
  const [busy, setBusy] = useState(false);
  const [actif, setActif] = useState<string | null>(null);
  const [form, setForm] = useState({ nom: "", essence: "", kilometrage: "", materiel: "" });
  const [edit, setEdit] = useState<string | null>(null);
  const [ef, setEf] = useState({ essence: "", kilometrage: "", materiel: "", dernierEntretien: "", note: "" });
  const cleRef = useRef("");
  const jeton = () => (cleRef.current ||= (globalThis.crypto?.randomUUID?.() ?? String(Date.now()) + Math.random()));

  async function creer() {
    if (!form.nom.trim()) { setFlash({ t: "bad", m: "Donne un nom / une immatriculation." }); return; }
    setBusy(true);
    const r = await creerAmbulance({ ...form, cle: jeton() });
    setBusy(false);
    if (!r.ok) { setFlash({ t: "bad", m: r.error || "Impossible." }); return; }
    cleRef.current = ""; setForm({ nom: "", essence: "", kilometrage: "", materiel: "" }); setFlash({ t: "ok", m: "Ambulance ajoutée." }); router.refresh();
  }

  async function faire(id: string, fn: () => Promise<{ ok: boolean; error?: string }>, okMsg: string) {
    setActif(id);
    const r = await fn();
    setActif(null);
    if (!r.ok) { setFlash({ t: "bad", m: r.error || "Impossible." }); return; }
    setFlash({ t: "ok", m: okMsg }); router.refresh();
  }

  function ouvrirEdit(a: Ambulance) {
    setEdit(a.id);
    setEf({ essence: a.essence == null ? "" : String(a.essence), kilometrage: a.kilometrage == null ? "" : String(a.kilometrage), materiel: a.materiel || "", dernierEntretien: a.dernierEntretien || "", note: a.note || "" });
  }
  async function enregistrer(id: string) {
    setActif(id);
    const r = await majAmbulance(id, ef);
    setActif(null);
    if (!r.ok) { setFlash({ t: "bad", m: r.error || "Impossible." }); return; }
    setEdit(null); setFlash({ t: "ok", m: "Ambulance mise à jour." }); router.refresh();
  }

  if (!data.canEdit) return (
    <div className="rounded-[14px] border border-border bg-surface p-8 text-center">
      <Truck className="mx-auto h-6 w-6 text-faint" />
      <p className="mt-2 text-[0.9rem] text-muted">La flotte d&apos;ambulances est réservée au personnel du dispensaire.</p>
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      {!data.pret ? <Flash tone="bad">Lance <b>web/prisma/sql/dispensaire-ambulances.sql</b> dans Supabase, puis recharge.</Flash> : null}
      {flash ? <Flash tone={flash.t === "ok" ? "good" : "bad"}>{flash.m}</Flash> : null}

      {/* Synthèse */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {ETATS_AMBULANCE.map((e) => (
          <div key={e} className="rounded-[12px] border border-border bg-surface p-3 text-center">
            <div className="font-num text-[1.5rem] font-bold" style={{ color: ETAT_AMBULANCE_TON[e] }}>{data.stats[e]}</div>
            <div className="text-[0.72rem] text-faint">{ETAT_AMBULANCE_LABEL[e]}</div>
          </div>
        ))}
      </div>

      {/* Ajout */}
      <section className="rounded-[14px] border border-border bg-surface p-4">
        <h3 className="mb-3 flex items-center gap-2 text-[0.9rem] font-semibold"><Plus className="h-4 w-4 text-accent" /> Ajouter une ambulance</h3>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <label className="flex flex-col gap-1"><span className="text-[0.7rem] uppercase tracking-[0.05em] text-faint">Nom / immat.</span><input className={inputCls} value={form.nom} onChange={(e) => setForm((p) => ({ ...p, nom: e.target.value }))} placeholder="Ambulance 1" /></label>
          <label className="flex flex-col gap-1"><span className="text-[0.7rem] uppercase tracking-[0.05em] text-faint">Essence (%)</span><input className={inputCls} inputMode="numeric" value={form.essence} onChange={(e) => setForm((p) => ({ ...p, essence: e.target.value.replace(/[^0-9]/g, "") }))} placeholder="100" /></label>
          <label className="flex flex-col gap-1"><span className="text-[0.7rem] uppercase tracking-[0.05em] text-faint">Kilométrage</span><input className={inputCls} inputMode="numeric" value={form.kilometrage} onChange={(e) => setForm((p) => ({ ...p, kilometrage: e.target.value.replace(/[^0-9]/g, "") }))} placeholder="Optionnel" /></label>
          <div className="flex items-end"><button onClick={creer} disabled={busy || !data.pret} className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[0.8rem] font-semibold text-black/85 disabled:opacity-60" style={{ background: "var(--accent)" }}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Ajouter</button></div>
        </div>
      </section>

      {/* Flotte */}
      {data.ambulances.length === 0 ? (
        <p className="py-6 text-center text-[0.85rem] italic text-faint">Aucune ambulance enregistrée.</p>
      ) : (
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {data.ambulances.map((a) => {
            const ton = ETAT_AMBULANCE_TON[a.etat];
            const busyRow = actif === a.id;
            const ess = a.essence ?? 0;
            const essTon = ess <= 20 ? "var(--oxblood)" : ess <= 50 ? "var(--warn)" : "var(--good)";
            return (
              <div key={a.id} className="flex flex-col rounded-[12px] border bg-surface p-3" style={{ borderColor: `color-mix(in srgb,${ton} 40%,var(--border))` }}>
                <div className="flex items-center gap-2">
                  <Truck className="h-4 w-4 shrink-0" style={{ color: ton }} />
                  <span className="text-[0.92rem] font-semibold">{a.nom}</span>
                  <span className="ml-auto rounded-full px-2 py-0.5 text-[0.64rem] font-bold uppercase" style={{ color: ton, background: `color-mix(in srgb,${ton} 14%,transparent)` }}>{ETAT_AMBULANCE_LABEL[a.etat]}</span>
                </div>

                {edit === a.id ? (
                  <div className="mt-2 flex flex-col gap-1.5">
                    <div className="flex gap-1.5">
                      <label className="flex flex-1 flex-col gap-0.5"><span className="text-[0.64rem] uppercase text-faint">Essence %</span><input className={inputCls + " h-8 py-1 text-[0.8rem]"} inputMode="numeric" value={ef.essence} onChange={(e) => setEf((p) => ({ ...p, essence: e.target.value.replace(/[^0-9]/g, "") }))} /></label>
                      <label className="flex flex-1 flex-col gap-0.5"><span className="text-[0.64rem] uppercase text-faint">Km</span><input className={inputCls + " h-8 py-1 text-[0.8rem]"} inputMode="numeric" value={ef.kilometrage} onChange={(e) => setEf((p) => ({ ...p, kilometrage: e.target.value.replace(/[^0-9]/g, "") }))} /></label>
                    </div>
                    <input className={inputCls + " h-8 py-1 text-[0.8rem]"} value={ef.materiel} onChange={(e) => setEf((p) => ({ ...p, materiel: e.target.value }))} placeholder="Matériel embarqué" />
                    <input className={inputCls + " h-8 py-1 text-[0.8rem]"} value={ef.dernierEntretien} onChange={(e) => setEf((p) => ({ ...p, dernierEntretien: e.target.value }))} placeholder="Dernier entretien (date)" />
                    <div className="flex gap-1.5">
                      <button onClick={() => enregistrer(a.id)} disabled={busyRow} className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-[0.74rem] font-semibold text-black/85 disabled:opacity-60" style={{ background: "var(--accent)" }}>{busyRow ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Enregistrer</button>
                      <button onClick={() => setEdit(null)} className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1.5 text-[0.74rem] font-semibold text-muted hover:text-ink"><X className="h-3.5 w-3.5" /></button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="mt-2 flex items-center gap-2 text-[0.78rem]">
                      <Fuel className="h-3.5 w-3.5" style={{ color: essTon }} />
                      <div className="h-2 flex-1 overflow-hidden rounded-full" style={{ background: "var(--surface-2)" }}><div className="h-full rounded-full" style={{ width: `${ess}%`, background: essTon }} /></div>
                      <span className="w-9 shrink-0 text-right font-num" style={{ color: essTon }}>{a.essence == null ? "—" : `${ess}%`}</span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[0.72rem] text-faint">
                      {a.kilometrage != null ? <span className="inline-flex items-center gap-0.5"><Gauge className="h-3 w-3" /> {a.kilometrage.toLocaleString("fr-FR")} km</span> : null}
                      {a.dernierEntretien ? <span className="inline-flex items-center gap-0.5"><Wrench className="h-3 w-3" /> {a.dernierEntretien}</span> : null}
                    </div>
                    {a.materiel ? <div className="mt-1 text-[0.76rem] text-muted">{a.materiel}</div> : null}

                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <select className={inputCls + " h-8 w-auto py-1 text-[0.74rem]"} value="" onChange={(e) => { if (e.target.value) faire(a.id, () => changerEtatAmbulance(a.id, e.target.value), "État mis à jour."); }} aria-label="Changer l'état">
                        <option value="">État…</option>
                        {ETATS_AMBULANCE.filter((e) => e !== a.etat).map((e) => <option key={e} value={e}>{ETAT_AMBULANCE_LABEL[e]}</option>)}
                      </select>
                      <button onClick={() => ouvrirEdit(a)} className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1.5 text-[0.74rem] font-semibold text-muted hover:text-ink"><Pencil className="h-3.5 w-3.5" /> Éditer</button>
                      <button onClick={() => faire(a.id, () => supprimerAmbulance(a.id), "Ambulance supprimée.")} disabled={busyRow} className="ml-auto inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1.5 text-[0.72rem] font-semibold text-muted transition hover:text-oxblood disabled:opacity-50"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
