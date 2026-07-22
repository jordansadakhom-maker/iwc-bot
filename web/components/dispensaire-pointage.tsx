"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardList, Play, Square, Loader2, Trash2, CalendarDays, Clock, Users } from "lucide-react";
import type { PointData, PointSession } from "@/lib/dispensaire-pointage";
import { Flash, inputCls } from "@/components/edit-ui";
import { prendreService, terminerService, supprimerPointage } from "@/app/dispensaire/pointage/actions";

type FlashMsg = { t: "ok" | "bad"; m: string } | null;
const JOURS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

const heureFR = (iso: string) => { try { return new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" }).format(new Date(iso)); } catch { return "—"; } };
const dateFR = (iso: string) => { try { return new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", weekday: "short", day: "2-digit", month: "short" }).format(new Date(iso)); } catch { return "—"; } };
function fmtMin(min: number) { if (min <= 0) return "0 min"; const h = Math.floor(min / 60), m = min % 60; return h ? `${h} h ${String(m).padStart(2, "0")}` : `${m} min`; }

// Horloge partagée : renvoie l'instant courant (ms) uniquement après montage
// (null côté serveur → aucun décalage d'hydratation).
function useNow(actif: boolean) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    if (!actif) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [actif]);
  return now;
}

export function DispensairePointage({ data }: { data: PointData }) {
  const router = useRouter();
  const [enCours, setEnCours] = useState<PointSession[]>(data.enCours);
  const [flash, setFlash] = useState<FlashMsg>(null);
  const [choix, setChoix] = useState("");
  const [manuel, setManuel] = useState("");
  const [busy, setBusy] = useState(false);
  const now = useNow(enCours.length > 0);

  useEffect(() => { setEnCours(data.enCours); }, [data.enCours]);

  const semaineTotal = useMemo(() => data.semaine.reduce((a, j) => a + j.min, 0), [data.semaine]);
  const maxJour = useMemo(() => Math.max(1, ...data.semaine.map((j) => j.min)), [data.semaine]);

  async function commencer() {
    const nomManuel = manuel.trim();
    const salarie = data.roster.find((r) => r.id === choix);
    const nom = nomManuel || salarie?.nom || "";
    if (!nom) { setFlash({ t: "bad", m: "Choisis un salarié ou saisis un nom." }); return; }
    if (enCours.some((s) => s.nom.toLowerCase() === nom.toLowerCase())) { setFlash({ t: "bad", m: `${nom} est déjà en service.` }); return; }
    setBusy(true);
    const tmp: PointSession = { id: "tmp-" + Math.random().toString(36).slice(2, 8), salarieId: nomManuel ? null : salarie?.id ?? null, nom, debut: new Date().toISOString(), fin: null, dureeMin: null, note: null };
    setEnCours((p) => [...p, tmp]); setChoix(""); setManuel("");
    const r = await prendreService({ salarieId: tmp.salarieId, nom });
    setBusy(false);
    if (!r.ok) { setEnCours((p) => p.filter((s) => s.id !== tmp.id)); setFlash({ t: "bad", m: r.error || "Impossible." }); }
    else { setEnCours((p) => p.map((s) => (s.id === tmp.id ? { ...s, id: r.id || tmp.id } : s))); setFlash({ t: "ok", m: `${nom} a pris son service.` }); }
  }

  async function terminer(sess: PointSession) {
    setEnCours((p) => p.filter((s) => s.id !== sess.id));
    const r = await terminerService(sess.id);
    if (!r.ok) { setEnCours((p) => [...p, sess]); setFlash({ t: "bad", m: r.error || "Impossible." }); }
    else { setFlash({ t: "ok", m: `Service de ${sess.nom} terminé.` }); router.refresh(); }
  }

  async function supprimer(id: string) {
    const r = await supprimerPointage(id);
    if (!r.ok) setFlash({ t: "bad", m: r.error || "Impossible." }); else router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      {!data.pret ? <Flash tone="bad">Lance <b>web/prisma/sql/dispensaire-pointage.sql</b> dans Supabase, puis recharge.</Flash> : null}
      {flash ? <Flash tone={flash.t === "ok" ? "good" : "bad"}>{flash.m}</Flash> : null}

      {/* Prise de service */}
      <section className="rounded-[14px] border border-border bg-surface p-4">
        <h3 className="mb-3 flex items-center gap-2 text-[0.9rem] font-semibold"><ClipboardList className="h-4 w-4 text-accent" /> Prise de service</h3>
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex min-w-[180px] flex-1 flex-col gap-1">
            <span className="text-[0.7rem] uppercase tracking-[0.05em] text-faint">Salarié</span>
            <select className={inputCls} value={choix} onChange={(e) => { setChoix(e.target.value); setManuel(""); }} disabled={busy}>
              <option value="">{data.roster.length ? "— Choisir —" : "Aucun salarié (voir RH)"}</option>
              {data.roster.map((r) => <option key={r.id} value={r.id}>{r.nom}{r.grade ? ` · ${r.grade}` : ""}</option>)}
            </select>
          </label>
          <label className="flex min-w-[150px] flex-1 flex-col gap-1">
            <span className="text-[0.7rem] uppercase tracking-[0.05em] text-faint">ou saisir un nom</span>
            <input className={inputCls} value={manuel} onChange={(e) => { setManuel(e.target.value); if (e.target.value) setChoix(""); }} placeholder="Prénom Nom" disabled={busy} />
          </label>
          <button onClick={commencer} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[0.8rem] font-semibold text-black/85 disabled:opacity-60" style={{ background: "var(--accent)" }}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" strokeWidth={2.2} />} Prendre le service
          </button>
        </div>
      </section>

      {/* En service */}
      <section className="rounded-[14px] border border-border bg-surface p-4">
        <div className="mb-3 flex items-center gap-2">
          <h3 className="flex items-center gap-2 text-[0.9rem] font-semibold"><Users className="h-4 w-4 text-accent" /> En service</h3>
          <span className="rounded-full px-2 py-0.5 text-[0.68rem] font-bold" style={{ color: enCours.length ? "var(--good)" : "var(--faint)", background: enCours.length ? "color-mix(in srgb,var(--good) 14%,transparent)" : "transparent" }}>{enCours.length}</span>
        </div>
        {enCours.length === 0 ? (
          <p className="py-6 text-center text-[0.85rem] italic text-faint">Personne au poste pour l&apos;instant — la première prise de service s&apos;affichera ici, en direct.</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {enCours.map((s) => {
              const live = now != null ? Math.max(0, Math.round((now - new Date(s.debut).getTime()) / 60000)) : null;
              return (
                <div key={s.id} className="flex items-center justify-between gap-3 rounded-[12px] border p-3" style={{ borderColor: "color-mix(in srgb,var(--good) 40%,var(--border))", background: "color-mix(in srgb,var(--good) 6%,var(--surface-2))" }}>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" style={{ background: "var(--good)" }} /><span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: "var(--good)" }} /></span>
                      <span className="truncate text-[0.9rem] font-semibold">{s.nom}</span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-1 text-[0.74rem] text-faint"><Clock className="h-3 w-3" /> depuis {heureFR(s.debut)}{live != null ? <span className="font-num text-muted"> · {fmtMin(live)}</span> : null}</div>
                  </div>
                  <button onClick={() => terminer(s)} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[0.76rem] font-semibold text-muted transition hover:text-ink" style={{ borderColor: "var(--border)" }}>
                    <Square className="h-3.5 w-3.5" /> Terminer
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Statistiques (jour / semaine / mois / total) */}
      <section className="rounded-[14px] border border-border bg-surface p-4">
        <h3 className="mb-3 flex items-center gap-2 text-[0.9rem] font-semibold"><Clock className="h-4 w-4 text-accent" /> Statistiques</h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {[
            { l: "Aujourd'hui", v: fmtMin(data.stats.jourMin) },
            { l: "Cette semaine", v: fmtMin(data.stats.semaineMin) },
            { l: "Ce mois", v: fmtMin(data.stats.moisMin) },
            { l: "Total", v: fmtMin(data.stats.totalMin) },
            { l: "Jours travaillés", v: String(data.stats.jours) },
            { l: "Moyenne / jour", v: fmtMin(data.stats.moyenneMin) },
          ].map((s) => (
            <div key={s.l} className="rounded-[10px] border border-border bg-surface-2 p-2.5">
              <div className="font-num text-[1.05rem] font-bold leading-none">{s.v}</div>
              <div className="mt-1 text-[0.64rem] uppercase tracking-[0.04em] text-faint">{s.l}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Semaine (Lun→Dim) */}
      <section className="rounded-[14px] border border-border bg-surface p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-[0.9rem] font-semibold"><CalendarDays className="h-4 w-4 text-accent" /> Cette semaine</h3>
          <span className="text-[0.78rem] text-faint">Total <b className="font-num text-ink">{fmtMin(semaineTotal)}</b></span>
        </div>
        <div className="grid grid-cols-7 gap-1.5">
          {data.semaine.map((j) => (
            <div key={j.dow} className="flex flex-col items-center gap-1">
              <div className="flex h-24 w-full items-end justify-center rounded-md border border-border bg-surface-2 p-1">
                <div className="w-full rounded-sm" title={fmtMin(j.min)} style={{ height: `${Math.max(3, Math.round((j.min / maxJour) * 100))}%`, background: j.min ? "var(--accent)" : "color-mix(in srgb,var(--ink) 10%,transparent)", minHeight: 3 }} />
              </div>
              <span className="text-[0.66rem] font-semibold text-faint">{JOURS[j.dow]}</span>
              <span className="font-num text-[0.62rem] text-muted">{j.min ? fmtMin(j.min) : "—"}</span>
            </div>
          ))}
        </div>
        {data.parSalarie.length ? (
          <div className="mt-3 flex flex-wrap gap-1.5 border-t border-border pt-3">
            {data.parSalarie.map((p) => (
              <span key={p.nom} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-2 px-2 py-1 text-[0.72rem]"><span className="font-semibold">{p.nom}</span><span className="font-num text-faint">{fmtMin(p.min)}</span></span>
            ))}
          </div>
        ) : null}
      </section>

      {/* Historique */}
      {data.historique.length ? (
        <section className="rounded-[14px] border border-border bg-surface p-4">
          <h3 className="mb-3 flex items-center gap-2 text-[0.9rem] font-semibold"><Clock className="h-4 w-4 text-accent" /> Derniers services</h3>
          <div className="flex flex-col divide-y divide-border">
            {data.historique.map((s) => (
              <div key={s.id} className="group flex items-center justify-between gap-3 py-1.5 text-[0.8rem]">
                <span className="min-w-0 truncate font-semibold">{s.nom}</span>
                <span className="shrink-0 text-faint">{dateFR(s.debut)} · {heureFR(s.debut)}{s.fin ? `–${heureFR(s.fin)}` : ""}</span>
                <span className="w-16 shrink-0 text-right font-num text-muted">{fmtMin(s.dureeMin || 0)}</span>
                <button onClick={() => supprimer(s.id)} className="shrink-0 text-faint opacity-0 transition hover:text-oxblood group-hover:opacity-100" aria-label="Supprimer"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
