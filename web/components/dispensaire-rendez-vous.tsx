"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Plus, Loader2, Check, UserX, X, Trash2, Stethoscope, DoorClosed, Pencil, MessageSquareText } from "lucide-react";
import { Flash, inputCls } from "@/components/edit-ui";
import { ETAT_RDV_LABEL, PRIORITES, PRIORITE_LABEL, PRIORITE_TON, type RendezVousData, type RendezVous } from "@/lib/dispensaire-rendez-vous-const";
import { creerRDV, majRDV, changerEtatRDV, supprimerRDV } from "@/app/dispensaire/rendez-vous/actions";

type FlashMsg = { t: "ok" | "bad"; m: string } | null;
const jourFR = (iso: string) => { try { return new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", weekday: "long", day: "2-digit", month: "long" }).format(new Date(iso)); } catch { return "—"; } };
const heureFR = (iso: string) => { try { return new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" }).format(new Date(iso)); } catch { return "—"; } };
const ETAT_TON: Record<string, string> = { prevu: "var(--accent)", honore: "var(--good)", absent: "var(--warn)", annule: "var(--muted)" };

export function DispensaireRendezVous({ data }: { data: RendezVousData }) {
  const router = useRouter();
  const [flash, setFlash] = useState<FlashMsg>(null);
  const [busy, setBusy] = useState(false);
  const [actif, setActif] = useState<string | null>(null);
  const [editRdv, setEditRdv] = useState<RendezVous | null>(null);
  const [form, setForm] = useState({ patient: "", type: "", debut: "", medecin: "", salle: "", priorite: "normale", motif: "" });
  const cleRef = useRef("");
  const jeton = () => (cleRef.current ||= (globalThis.crypto?.randomUUID?.() ?? String(Date.now()) + Math.random()));

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((p) => ({ ...p, [k]: e.target.value }));

  // Regroupe les rendez-vous à venir par jour (Paris).
  const parJour = useMemo(() => {
    const m = new Map<string, RendezVous[]>();
    for (const r of data.aVenir) { const j = jourFR(r.debut); if (!m.has(j)) m.set(j, []); m.get(j)!.push(r); }
    return [...m.entries()];
  }, [data.aVenir]);

  async function creer() {
    if (!form.patient.trim()) { setFlash({ t: "bad", m: "Indique le patient." }); return; }
    if (!form.debut) { setFlash({ t: "bad", m: "Choisis la date et l'heure." }); return; }
    let debutIso = "";
    try { debutIso = new Date(form.debut).toISOString(); } catch { setFlash({ t: "bad", m: "Date invalide." }); return; }
    setBusy(true);
    const r = await creerRDV({ ...form, debut: debutIso, cle: jeton() });
    setBusy(false);
    if (!r.ok) { setFlash({ t: "bad", m: r.error || "Impossible." }); return; }
    cleRef.current = "";
    setForm({ patient: "", type: "", debut: "", medecin: "", salle: "", priorite: "normale", motif: "" });
    setFlash({ t: "ok", m: "Rendez-vous planifié." });
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

  if (!data.canEdit) return (
    <div className="rounded-[14px] border border-border bg-surface p-8 text-center">
      <CalendarClock className="mx-auto h-6 w-6 text-faint" />
      <p className="mt-2 text-[0.9rem] text-muted">Le planning est réservé au personnel du dispensaire.</p>
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      <datalist id="rdv-patients">{data.patients.map((p) => <option key={p} value={p} />)}</datalist>
      <datalist id="rdv-medecins">{data.medecins.map((m) => <option key={m} value={m} />)}</datalist>

      {!data.pret ? <Flash tone="bad">Lance <b>web/prisma/sql/dispensaire-rendez-vous.sql</b> dans Supabase, puis recharge.</Flash> : null}
      {flash ? <Flash tone={flash.t === "ok" ? "good" : "bad"}>{flash.m}</Flash> : null}

      {/* Nouveau rendez-vous */}
      <section className="rounded-[14px] border border-border bg-surface p-4">
        <h3 className="mb-3 flex items-center gap-2 text-[0.9rem] font-semibold"><Plus className="h-4 w-4 text-accent" /> Planifier un rendez-vous</h3>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <label className="flex flex-col gap-1"><span className="text-[0.7rem] uppercase tracking-[0.05em] text-faint">Patient</span><input className={inputCls} list="rdv-patients" value={form.patient} onChange={set("patient")} placeholder="Prénom Nom" /></label>
          <label className="flex flex-col gap-1"><span className="text-[0.7rem] uppercase tracking-[0.05em] text-faint">Date &amp; heure</span><input type="datetime-local" className={inputCls} value={form.debut} onChange={set("debut")} /></label>
          <label className="flex flex-col gap-1"><span className="text-[0.7rem] uppercase tracking-[0.05em] text-faint">Type</span><input className={inputCls} value={form.type} onChange={set("type")} placeholder="Consultation, contrôle…" /></label>
          <label className="flex flex-col gap-1"><span className="text-[0.7rem] uppercase tracking-[0.05em] text-faint">Médecin</span><input className={inputCls} list="rdv-medecins" value={form.medecin} onChange={set("medecin")} placeholder="Optionnel" /></label>
          <label className="flex flex-col gap-1"><span className="text-[0.7rem] uppercase tracking-[0.05em] text-faint">Salle</span><input className={inputCls} value={form.salle} onChange={set("salle")} placeholder="Optionnel" /></label>
          <label className="flex flex-col gap-1"><span className="text-[0.7rem] uppercase tracking-[0.05em] text-faint">Priorité</span><select className={inputCls} value={form.priorite} onChange={set("priorite")}>{PRIORITES.map((p) => <option key={p} value={p}>{PRIORITE_LABEL[p]}</option>)}</select></label>
          <label className="flex flex-col gap-1 sm:col-span-2"><span className="text-[0.7rem] uppercase tracking-[0.05em] text-faint">Motif</span><input className={inputCls} value={form.motif} onChange={set("motif")} placeholder="Optionnel" /></label>
          <div className="flex items-end"><button onClick={creer} disabled={busy || !data.pret} className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[0.8rem] font-semibold text-black/85 disabled:opacity-60" style={{ background: "var(--accent)" }}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Planifier</button></div>
        </div>
      </section>

      {/* À venir */}
      <section className="rounded-[14px] border border-border bg-surface p-4">
        <div className="mb-3 flex items-center gap-2">
          <h3 className="flex items-center gap-2 text-[0.9rem] font-semibold"><CalendarClock className="h-4 w-4 text-accent" /> À venir</h3>
          <span className="rounded-full px-2 py-0.5 text-[0.68rem] font-bold" style={{ color: data.aVenir.length ? "var(--accent)" : "var(--faint)", background: data.aVenir.length ? "color-mix(in srgb,var(--accent) 14%,transparent)" : "transparent" }}>{data.aVenir.length}</span>
        </div>
        {parJour.length === 0 ? (
          <p className="py-6 text-center text-[0.85rem] italic text-faint">Aucun rendez-vous à venir.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {parJour.map(([jour, liste]) => (
              <div key={jour}>
                <div className="mb-1.5 text-[0.72rem] font-semibold uppercase tracking-[0.05em] text-faint">{jour}</div>
                <div className="flex flex-col gap-1.5">
                  {liste.map((r) => (
                    <div key={r.id} className="flex flex-wrap items-center gap-2 rounded-[11px] border border-border bg-surface-2 p-2.5 text-[0.82rem]">
                      <span className="font-num font-semibold" style={{ color: "var(--ink)" }}>{heureFR(r.debut)}</span>
                      <span className="rounded-full px-2 py-0.5 text-[0.64rem] font-bold uppercase" style={{ color: PRIORITE_TON[r.priorite], background: `color-mix(in srgb,${PRIORITE_TON[r.priorite]} 14%,transparent)` }}>{PRIORITE_LABEL[r.priorite]}</span>
                      <span className="min-w-0 flex-1 truncate"><b className="font-semibold">{r.patient}</b>{r.type ? <span className="text-faint"> · {r.type}</span> : ""}{r.medecin ? <span className="inline-flex items-center gap-0.5 text-faint"> · <Stethoscope className="h-3 w-3" />{r.medecin}</span> : ""}{r.salle ? <span className="inline-flex items-center gap-0.5 text-faint"> · <DoorClosed className="h-3 w-3" />{r.salle}</span> : ""}</span>
                      <div className="flex shrink-0 items-center gap-1">
                        <button onClick={() => setEditRdv(r)} disabled={actif === r.id} className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-[0.72rem] font-semibold text-muted hover:text-accent disabled:opacity-50" title="Modifier le rendez-vous"><Pencil className="h-3 w-3" /> Modifier</button>
                        <button onClick={() => faire(r.id, () => changerEtatRDV(r.id, "honore"), "Marqué honoré.")} disabled={actif === r.id} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[0.72rem] font-semibold text-black/85 disabled:opacity-60" style={{ background: "var(--good)" }}><Check className="h-3 w-3" /> Honoré</button>
                        <button onClick={() => faire(r.id, () => changerEtatRDV(r.id, "absent"), "Marqué absent.")} disabled={actif === r.id} className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-[0.72rem] font-semibold text-muted hover:text-ink disabled:opacity-50"><UserX className="h-3 w-3" /> Absent</button>
                        <button onClick={() => faire(r.id, () => changerEtatRDV(r.id, "annule"), "Rendez-vous annulé.")} disabled={actif === r.id} className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-[0.72rem] font-semibold text-muted hover:text-oxblood disabled:opacity-50"><X className="h-3 w-3" /> Annuler</button>
                      </div>
                      {r.motif ? <p className="basis-full text-[0.78rem] text-muted"><MessageSquareText className="mr-1 inline h-3.5 w-3.5 align-[-2px] text-faint" /><span className="text-faint">Motif :</span> {r.motif}</p> : null}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Historique */}
      {data.passes.length ? (
        <section className="rounded-[14px] border border-border bg-surface p-4">
          <h3 className="mb-2 flex items-center gap-2 text-[0.9rem] font-semibold">Historique</h3>
          <div className="flex flex-col divide-y divide-border/70">
            {data.passes.map((r) => (
              <div key={r.id} className="group flex items-center gap-2 py-1.5 text-[0.8rem]">
                <span className="shrink-0 font-num text-faint">{jourFR(r.debut).split(" ").slice(1).join(" ")} · {heureFR(r.debut)}</span>
                <span className="min-w-0 flex-1 truncate"><b className="font-semibold">{r.patient}</b>{r.type ? <span className="text-faint"> · {r.type}</span> : ""}</span>
                <span className="shrink-0 rounded-full px-2 py-0.5 text-[0.64rem] font-bold" style={{ color: ETAT_TON[r.etat], background: `color-mix(in srgb,${ETAT_TON[r.etat]} 14%,transparent)` }}>{ETAT_RDV_LABEL[r.etat]}</span>
                <button onClick={() => faire(r.id, () => supprimerRDV(r.id), "Rendez-vous supprimé.")} disabled={actif === r.id} className="shrink-0 text-faint opacity-0 transition hover:text-oxblood group-hover:opacity-100 disabled:opacity-50" aria-label="Supprimer"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {editRdv ? (
        <EditRDVModal
          rdv={editRdv}
          patients={data.patients}
          medecins={data.medecins}
          onClose={() => setEditRdv(null)}
          onDone={(m) => { setFlash(m); if (m?.t === "ok") { setEditRdv(null); router.refresh(); } }}
        />
      ) : null}
    </div>
  );
}

// Convertit un ISO en valeur pour <input type="datetime-local"> (heure locale du
// navigateur, cohérent avec la création qui interprète la saisie en heure locale).
function isoVersLocal(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

// ── Modale d'édition d'un rendez-vous ─────────────────────────────────────────
function EditRDVModal({ rdv, patients, medecins, onClose, onDone }: { rdv: RendezVous; patients: string[]; medecins: string[]; onClose: () => void; onDone: (m: FlashMsg) => void }) {
  const [f, setF] = useState({ patient: rdv.patient, debut: isoVersLocal(rdv.debut), type: rdv.type || "", medecin: rdv.medecin || "", salle: rdv.salle || "", priorite: rdv.priorite as string, motif: rdv.motif || "" });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF((p) => ({ ...p, [k]: e.target.value }));
  async function save() {
    if (!f.patient.trim()) { onDone({ t: "bad", m: "Indique le patient." }); return; }
    if (!f.debut) { onDone({ t: "bad", m: "Choisis la date et l'heure." }); return; }
    let debutIso = "";
    try { debutIso = new Date(f.debut).toISOString(); } catch { onDone({ t: "bad", m: "Date invalide." }); return; }
    setBusy(true);
    const r = await majRDV(rdv.id, { patient: f.patient, debut: debutIso, type: f.type, medecin: f.medecin, salle: f.salle, priorite: f.priorite, motif: f.motif });
    setBusy(false);
    if (!r.ok) { onDone({ t: "bad", m: r.error || "Impossible." }); return; }
    onDone({ t: "ok", m: "Rendez-vous modifié." });
  }
  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-auto bg-black/55 p-4" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="iwc-pop w-full max-w-[560px] rounded-[14px] border border-border-2 bg-surface shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="flex items-center gap-2 font-display text-[1.05rem]"><Pencil className="h-4 w-4 text-accent" /> Modifier le rendez-vous</h2>
          <button onClick={onClose} className="text-faint hover:text-ink"><X className="h-4 w-4" /></button>
        </div>
        <div className="grid gap-2 p-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1"><span className="text-[0.7rem] uppercase tracking-[0.05em] text-faint">Patient</span><input className={inputCls} list="rdv-patients" value={f.patient} onChange={set("patient")} /></label>
          <label className="flex flex-col gap-1"><span className="text-[0.7rem] uppercase tracking-[0.05em] text-faint">Date &amp; heure</span><input type="datetime-local" className={inputCls} value={f.debut} onChange={set("debut")} /></label>
          <label className="flex flex-col gap-1"><span className="text-[0.7rem] uppercase tracking-[0.05em] text-faint">Type</span><input className={inputCls} value={f.type} onChange={set("type")} placeholder="Consultation, contrôle…" /></label>
          <label className="flex flex-col gap-1"><span className="text-[0.7rem] uppercase tracking-[0.05em] text-faint">Médecin</span><input className={inputCls} list="rdv-medecins" value={f.medecin} onChange={set("medecin")} placeholder="Optionnel" /></label>
          <label className="flex flex-col gap-1"><span className="text-[0.7rem] uppercase tracking-[0.05em] text-faint">Salle</span><input className={inputCls} value={f.salle} onChange={set("salle")} placeholder="Optionnel" /></label>
          <label className="flex flex-col gap-1"><span className="text-[0.7rem] uppercase tracking-[0.05em] text-faint">Priorité</span><select className={inputCls} value={f.priorite} onChange={set("priorite")}>{PRIORITES.map((p) => <option key={p} value={p}>{PRIORITE_LABEL[p]}</option>)}</select></label>
          <label className="flex flex-col gap-1 sm:col-span-2"><span className="text-[0.7rem] uppercase tracking-[0.05em] text-faint">Motif</span><textarea className={inputCls} rows={2} value={f.motif} onChange={set("motif")} placeholder="Motif du rendez-vous" /></label>
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-4 py-3">
          <button onClick={onClose} className="rounded-lg border border-border px-3 py-1.5 text-[0.8rem] font-semibold transition hover:border-accent">Annuler</button>
          <button onClick={save} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[0.8rem] font-semibold text-black/85 disabled:opacity-60" style={{ background: "var(--accent)" }}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Enregistrer</button>
        </div>
      </div>
    </div>
  );
}
