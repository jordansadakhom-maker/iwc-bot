"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Plus, Loader2, Check, UserX, X, Trash2, Stethoscope, DoorClosed, Pencil, MessageSquareText, ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { Flash, inputCls } from "@/components/edit-ui";
import { ETAT_RDV_LABEL, PRIORITES, PRIORITE_LABEL, PRIORITE_TON, type RendezVousData, type RendezVous } from "@/lib/dispensaire-rendez-vous-const";
import { creerRDV, majRDV, changerEtatRDV, supprimerRDV } from "@/app/dispensaire/rendez-vous/actions";

type FlashMsg = { t: "ok" | "bad"; m: string } | null;
const jourFR = (iso: string) => { try { return new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", weekday: "long", day: "2-digit", month: "long" }).format(new Date(iso)); } catch { return "—"; } };
const heureFR = (iso: string) => { try { return new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" }).format(new Date(iso)); } catch { return "—"; } };
// Date civile Paris « YYYY-MM-DD » d'un instant (clé de regroupement du calendrier).
const ymdOf = (iso: string) => { try { return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso)); } catch { return ""; } };
const pad2 = (n: number) => String(n).padStart(2, "0");
const dateLongue = (ymd: string) => { try { return new Intl.DateTimeFormat("fr-FR", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date(ymd + "T12:00:00Z")); } catch { return ymd; } };
const ETAT_TON: Record<string, string> = { prevu: "var(--accent)", honore: "var(--good)", absent: "var(--warn)", annule: "var(--muted)" };

export function DispensaireRendezVous({ data }: { data: RendezVousData }) {
  const router = useRouter();
  const [flash, setFlash] = useState<FlashMsg>(null);
  const [busy, setBusy] = useState(false);
  const [actif, setActif] = useState<string | null>(null);
  const [editRdv, setEditRdv] = useState<RendezVous | null>(null);
  const [form, setForm] = useState({ patient: "", type: "", debut: "", medecin: "", salle: "", priorite: "normale", motif: "" });
  const [filtreDate, setFiltreDate] = useState(""); // ymd Paris sélectionné dans le calendrier (vide = tout)
  const cleRef = useRef("");
  const jeton = () => (cleRef.current ||= (globalThis.crypto?.randomUUID?.() ?? String(Date.now()) + Math.random()));

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((p) => ({ ...p, [k]: e.target.value }));

  // Regroupe les rendez-vous à venir par jour (Paris), filtrés par la date choisie
  // dans le calendrier le cas échéant.
  const parJour = useMemo(() => {
    const m = new Map<string, RendezVous[]>();
    for (const r of data.aVenir) {
      if (filtreDate && ymdOf(r.debut) !== filtreDate) continue;
      const j = jourFR(r.debut); if (!m.has(j)) m.set(j, []); m.get(j)!.push(r);
    }
    return [...m.entries()];
  }, [data.aVenir, filtreDate]);

  async function creer() {
    if (!form.patient.trim()) { setFlash({ t: "bad", m: "Indique le patient." }); return; }
    if (!form.debut) { setFlash({ t: "bad", m: "Choisis la date et l'heure." }); return; }
    let debutIso = "";
    try { debutIso = new Date(form.debut).toISOString(); } catch { setFlash({ t: "bad", m: "Date invalide." }); return; }
    setBusy(true);
    let r = await creerRDV({ ...form, debut: debutIso, cle: jeton() });
    // Chevauchement médecin/salle → NON bloquant : on propose de planifier quand même.
    if (!r.ok && r.conflit && typeof window !== "undefined" && window.confirm(`${r.error}\n\nPlanifier quand même ce rendez-vous à cette date et heure ?`)) {
      r = await creerRDV({ ...form, debut: debutIso, cle: jeton(), forcer: true });
    }
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

        {/* Calendrier — aperçu des dates réservées à l'avance */}
        {data.aVenir.length > 0 ? <CalendrierRDV rdvs={data.aVenir} selected={filtreDate} onPick={(y) => setFiltreDate((cur) => (cur === y ? "" : y))} /> : null}
        {filtreDate ? (
          <div className="mb-2 flex flex-wrap items-center gap-2 text-[0.76rem]">
            <span className="rounded-full border border-accent/40 px-2 py-0.5 font-semibold capitalize text-accent">{dateLongue(filtreDate)}</span>
            <button onClick={() => setFiltreDate("")} className="inline-flex items-center gap-1 text-faint hover:text-ink"><X className="h-3 w-3" /> Tout afficher</button>
          </div>
        ) : null}

        {parJour.length === 0 ? (
          <p className="py-6 text-center text-[0.85rem] italic text-faint">{filtreDate ? "Aucun rendez-vous ce jour-là." : "Aucun rendez-vous à venir."}</p>
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

// ── Calendrier mensuel des rendez-vous à venir (aperçu des dates réservées) ───
function CalendrierRDV({ rdvs, selected, onPick }: { rdvs: RendezVous[]; selected: string; onPick: (ymd: string) => void }) {
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rdvs) { const y = ymdOf(r.debut); if (y) m.set(y, (m.get(y) || 0) + 1); }
    return m;
  }, [rdvs]);
  const todayYmd = ymdOf(new Date().toISOString());
  const [cur, setCur] = useState(() => ({ y: Number(todayYmd.slice(0, 4)) || 1970, m: Number(todayYmd.slice(5, 7)) || 1 }));
  const bump = (delta: number) => setCur((c) => { const idx = c.y * 12 + (c.m - 1) + delta; return { y: Math.floor(idx / 12), m: (idx % 12) + 1 }; });

  const daysInMonth = new Date(Date.UTC(cur.y, cur.m, 0)).getUTCDate();
  const startDow = (new Date(Date.UTC(cur.y, cur.m - 1, 1)).getUTCDay() + 6) % 7; // Lun = 0
  const cells: (number | null)[] = [...Array(startDow).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  const moisLabel = new Intl.DateTimeFormat("fr-FR", { timeZone: "UTC", month: "long", year: "numeric" }).format(new Date(Date.UTC(cur.y, cur.m - 1, 1)));

  return (
    <div className="mb-3 rounded-[12px] border border-border bg-surface-2 p-3">
      <div className="mb-2 flex items-center justify-between">
        <button onClick={() => bump(-1)} className="grid h-7 w-7 place-items-center rounded-md border border-border text-faint hover:text-ink" aria-label="Mois précédent"><ChevronLeft className="h-4 w-4" /></button>
        <span className="inline-flex items-center gap-1.5 text-[0.82rem] font-semibold capitalize"><CalendarDays className="h-3.5 w-3.5 text-accent" /> {moisLabel}</span>
        <button onClick={() => bump(1)} className="grid h-7 w-7 place-items-center rounded-md border border-border text-faint hover:text-ink" aria-label="Mois suivant"><ChevronRight className="h-4 w-4" /></button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[0.6rem] font-semibold uppercase text-faint">
        {["L", "M", "M", "J", "V", "S", "D"].map((d, i) => <div key={i}>{d}</div>)}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {cells.map((d, i) => {
          if (d === null) return <div key={i} />;
          const ymd = `${cur.y}-${pad2(cur.m)}-${pad2(d)}`;
          const n = counts.get(ymd) || 0;
          const isToday = ymd === todayYmd;
          const isSel = ymd === selected;
          return (
            <button key={i} onClick={() => n && onPick(ymd)} disabled={!n}
              className="relative grid aspect-square place-items-center rounded-md border text-[0.72rem] font-num transition disabled:cursor-default"
              style={{
                borderColor: isSel ? "var(--accent)" : isToday ? "color-mix(in srgb,var(--accent) 45%,var(--border))" : "var(--border)",
                background: isSel ? "color-mix(in srgb,var(--accent) 22%,transparent)" : n ? "color-mix(in srgb,var(--accent) 9%,transparent)" : "transparent",
                color: n ? "var(--ink)" : "var(--faint)", fontWeight: n ? 700 : 400,
              }}
              title={n ? `${n} rendez-vous` : undefined}>
              {d}
              {n ? <span className="absolute bottom-0.5 right-0.5 grid h-3 min-w-[12px] place-items-center rounded-full px-0.5 text-[0.5rem] font-bold text-black/85" style={{ background: "var(--accent)" }}>{n}</span> : null}
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-[0.66rem] text-faint">Les jours surlignés sont réservés — clique dessus pour n&apos;afficher que ce jour.</p>
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
    const patch = { patient: f.patient, debut: debutIso, type: f.type, medecin: f.medecin, salle: f.salle, priorite: f.priorite, motif: f.motif };
    let r = await majRDV(rdv.id, patch);
    if (!r.ok && r.conflit && typeof window !== "undefined" && window.confirm(`${r.error}\n\nEnregistrer quand même ce rendez-vous ?`)) {
      r = await majRDV(rdv.id, { ...patch, forcer: true });
    }
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
