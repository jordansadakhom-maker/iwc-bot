"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardList, Play, Square, Loader2, Trash2, CalendarDays, Clock, Users, CalendarRange, UserX, Plus, Check } from "lucide-react";
import type { PointData, PointSession, AssiduiteData, AbsenceRow } from "@/lib/dispensaire-pointage";
import { statutDe, STATUT_META } from "@/lib/dispensaire-pointage-const";
import { Flash, inputCls } from "@/components/edit-ui";
import { prendreService, terminerService, supprimerPointage, ajouterAbsence, supprimerAbsence } from "@/app/dispensaire/pointage/actions";

type FlashMsg = { t: "ok" | "bad"; m: string } | null;
const JOURS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const jjmm = (ymd: string) => { const p = ymd.split("-"); return p.length === 3 ? `${p[2]}/${p[1]}` : ymd; };
const labelSemaine = (i: number) => (i === 0 ? "Précédente" : i === 1 ? "Cette semaine" : "Suivante");

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

export function DispensairePointage({ data, assiduite, absences = [], peutGerer = false }: { data: PointData; assiduite?: AssiduiteData; absences?: AbsenceRow[]; peutGerer?: boolean }) {
  const router = useRouter();
  const [enCours, setEnCours] = useState<PointSession[]>(data.enCours);
  const [flash, setFlash] = useState<FlashMsg>(null);
  const [choix, setChoix] = useState("");
  const [manuel, setManuel] = useState("");
  const [busy, setBusy] = useState(false);
  const now = useNow(enCours.length > 0);

  // Absences (encadrement) — état local + formulaire.
  const [absList, setAbsList] = useState<AbsenceRow[]>(absences);
  const today = useMemo(() => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()), []);
  const [abs, setAbs] = useState({ choix: "", manuel: "", date: today, justifiee: true, motif: "" });
  const [absBusy, setAbsBusy] = useState(false);

  useEffect(() => { setEnCours(data.enCours); }, [data.enCours]);
  useEffect(() => { setAbsList(absences); }, [absences]);

  const semaineTotal = useMemo(() => data.semaine.reduce((a, j) => a + j.min, 0), [data.semaine]);
  const maxJour = useMemo(() => Math.max(1, ...data.semaine.map((j) => j.min)), [data.semaine]);

  async function commencer() {
    const nomManuel = manuel.trim();
    const salarie = data.roster.find((r) => r.id === choix);
    const nom = nomManuel || salarie?.nom || "";
    if (!nom) { setFlash({ t: "bad", m: "Choisis un salarié ou saisis un nom." }); return; }
    if (enCours.some((s) => s.nom.toLowerCase() === nom.toLowerCase())) { setFlash({ t: "bad", m: `${nom} est déjà en service.` }); return; }
    setBusy(true);
    const tmp: PointSession = { id: "tmp-" + Math.random().toString(36).slice(2, 8), salarieId: nomManuel ? null : salarie?.id ?? null, nom, debut: new Date().toISOString(), fin: null, dureeMin: null, note: null, lastSeen: new Date().toISOString(), finSource: null, valide: null, etat: "en_service", commentaire: null, corrigePar: null };
    setEnCours((p) => [...p, tmp]); setChoix(""); setManuel("");
    const r = await prendreService({ salarieId: tmp.salarieId, nom });
    setBusy(false);
    if (!r.ok) { setEnCours((p) => p.filter((s) => s.id !== tmp.id)); setFlash({ t: "bad", m: r.error || "Impossible." }); }
    else { setEnCours((p) => p.map((s) => (s.id === tmp.id ? { ...s, id: r.id || tmp.id } : s))); setFlash({ t: "ok", m: `${nom} a pris son service.` }); router.refresh(); }
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

  async function ajoutAbsence() {
    const sal = data.roster.find((r) => r.id === abs.choix);
    const nom = abs.manuel.trim() || sal?.nom || "";
    if (!nom) { setFlash({ t: "bad", m: "Choisis un salarié ou saisis un nom." }); return; }
    if (!abs.date) { setFlash({ t: "bad", m: "Choisis une date." }); return; }
    setAbsBusy(true);
    const r = await ajouterAbsence({ salarieId: abs.manuel.trim() ? null : sal?.id ?? null, nom, date: abs.date, justifiee: abs.justifiee, motif: abs.motif.trim() });
    setAbsBusy(false);
    if (!r.ok) { setFlash({ t: "bad", m: r.error || "Impossible." }); return; }
    setAbsList((p) => [{ id: r.id || "tmp", salarieId: null, nom, date: abs.date, justifiee: abs.justifiee, motif: abs.motif.trim() || null }, ...p]);
    setAbs((p) => ({ ...p, choix: "", manuel: "", motif: "" }));
    setFlash({ t: "ok", m: `Absence enregistrée — ${nom}.` });
    router.refresh();
  }
  async function suppAbsence(id: string) {
    setAbsList((p) => p.filter((a) => a.id !== id));
    const r = await supprimerAbsence(id);
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

      {/* Assiduité sur 3 semaines (précédente / actuelle / suivante) */}
      <section className="rounded-[14px] border border-border bg-surface p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-[0.9rem] font-semibold"><CalendarRange className="h-4 w-4 text-accent" /> Assiduité · 3 semaines</h3>
          <span className="text-[0.72rem] text-faint">Jours travaillés, heures et absences — base du calcul des salaires.</span>
        </div>
        {!assiduite || !assiduite.pret ? (
          <p className="py-4 text-center text-[0.82rem] italic text-faint">Assiduité indisponible — lance <b>dispensaire-pointage.sql</b> (et <b>dispensaire-absences.sql</b> pour les absences).</p>
        ) : assiduite.lignes.length === 0 ? (
          <p className="py-4 text-center text-[0.82rem] italic text-faint">Aucun salarié — ajoute des salariés dans RH.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] border-collapse text-left text-[0.8rem]">
              <thead>
                <tr className="text-[0.64rem] uppercase tracking-[0.05em] text-faint">
                  <th className="border-b border-border px-2 py-2 font-semibold">Salarié</th>
                  {assiduite.lundis.map((l, i) => <th key={i} className="border-b border-border px-2 py-2 text-center font-semibold">{labelSemaine(i)}<div className="font-num text-[0.6rem] normal-case text-faint">dès {jjmm(l)}</div></th>)}
                </tr>
              </thead>
              <tbody>
                {assiduite.lignes.map((ln) => (
                  <tr key={ln.nom} className="hover:bg-[color-mix(in_srgb,var(--ink)_4%,transparent)]">
                    <td className="border-b border-border px-2 py-2"><div className="font-semibold">{ln.nom}</div>{ln.grade ? <div className="text-[0.66rem] text-faint">{ln.grade}</div> : null}</td>
                    {ln.semaines.map((s, i) => (
                      <td key={i} className="border-b border-border px-2 py-2 text-center align-top" style={i === 1 ? { background: "color-mix(in srgb,var(--accent) 6%,transparent)" } : undefined}>
                        <div className="font-num"><b>{s.jours}</b> j · {fmtMin(s.heuresMin)}</div>
                        <div className="mt-0.5 flex flex-wrap items-center justify-center gap-x-1.5 text-[0.66rem]">
                          {s.absJust ? <span style={{ color: "var(--good)" }}>{s.absJust} just.</span> : null}
                          {s.absInj ? <span style={{ color: "var(--oxblood)" }}>{s.absInj} inj.</span> : null}
                          {s.oublis ? <span style={{ color: "var(--warn)" }} title="services oubliés">⚠ {s.oublis}</span> : null}
                          {s.corrections ? <span style={{ color: "var(--accent)" }} title="corrections">✏ {s.corrections}</span> : null}
                          {!s.absJust && !s.absInj && !s.oublis && !s.corrections ? <span className="text-faint">—</span> : null}
                        </div>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Absences (encadrement RH / Direction) */}
      {peutGerer ? (
        <section className="rounded-[14px] border border-border bg-surface p-4">
          <h3 className="mb-3 flex items-center gap-2 text-[0.9rem] font-semibold"><UserX className="h-4 w-4 text-accent" /> Absences</h3>
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex min-w-[150px] flex-1 flex-col gap-1">
              <span className="text-[0.7rem] uppercase tracking-[0.05em] text-faint">Salarié</span>
              <select className={inputCls} value={abs.choix} onChange={(e) => setAbs((p) => ({ ...p, choix: e.target.value, manuel: "" }))} disabled={absBusy}>
                <option value="">{data.roster.length ? "— Choisir —" : "Aucun salarié (voir RH)"}</option>
                {data.roster.map((r) => <option key={r.id} value={r.id}>{r.nom}{r.grade ? ` · ${r.grade}` : ""}</option>)}
              </select>
            </label>
            <label className="flex min-w-[120px] flex-col gap-1">
              <span className="text-[0.7rem] uppercase tracking-[0.05em] text-faint">Date</span>
              <input type="date" className={inputCls} value={abs.date} onChange={(e) => setAbs((p) => ({ ...p, date: e.target.value }))} disabled={absBusy} />
            </label>
            <div className="flex flex-col gap-1">
              <span className="text-[0.7rem] uppercase tracking-[0.05em] text-faint">Type</span>
              <div className="inline-flex rounded-lg border border-border bg-surface-2 p-0.5">
                {([[true, "Justifiée", "var(--good)"], [false, "Injustifiée", "var(--oxblood)"]] as const).map(([val, lbl, tone]) => (
                  <button key={String(val)} type="button" onClick={() => setAbs((p) => ({ ...p, justifiee: val }))} className="rounded-md px-2.5 py-1.5 text-[0.74rem] font-semibold transition" style={abs.justifiee === val ? { background: tone, color: "#000" } : { color: "var(--muted)" }}>{lbl}</button>
                ))}
              </div>
            </div>
            <label className="flex min-w-[140px] flex-1 flex-col gap-1">
              <span className="text-[0.7rem] uppercase tracking-[0.05em] text-faint">Motif (facultatif)</span>
              <input className={inputCls} value={abs.motif} onChange={(e) => setAbs((p) => ({ ...p, motif: e.target.value }))} placeholder="Maladie, congé…" disabled={absBusy} />
            </label>
            <button onClick={ajoutAbsence} disabled={absBusy} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[0.8rem] font-semibold text-black/85 disabled:opacity-60" style={{ background: "var(--accent)" }}>{absBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Enregistrer</button>
          </div>
          {absList.length ? (
            <div className="mt-3 flex flex-col divide-y divide-border border-t border-border pt-1">
              {absList.map((a) => (
                <div key={a.id} className="group flex items-center gap-2 py-1.5 text-[0.8rem]">
                  <span className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[0.62rem] font-bold" style={a.justifiee ? { color: "var(--good)", background: "color-mix(in srgb,var(--good) 14%,transparent)" } : { color: "#fff", background: "var(--oxblood)" }}>{a.justifiee ? <Check className="h-2.5 w-2.5" /> : null}{a.justifiee ? "Justifiée" : "Injustifiée"}</span>
                  <span className="min-w-0 flex-1 truncate"><b className="font-semibold">{a.nom}</b>{a.motif ? <span className="text-faint"> — {a.motif}</span> : null}</span>
                  <span className="shrink-0 font-num text-faint">{jjmm(a.date)}</span>
                  <button onClick={() => suppAbsence(a.id)} className="shrink-0 text-faint opacity-0 transition hover:text-oxblood group-hover:opacity-100" aria-label="Supprimer"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              ))}
            </div>
          ) : <p className="mt-3 border-t border-border pt-3 text-center text-[0.78rem] italic text-faint">Aucune absence enregistrée.</p>}
        </section>
      ) : null}

      {/* Historique */}
      {data.historique.length ? (
        <section className="rounded-[14px] border border-border bg-surface p-4">
          <h3 className="mb-3 flex items-center gap-2 text-[0.9rem] font-semibold"><Clock className="h-4 w-4 text-accent" /> Derniers services</h3>
          <div className="flex flex-col divide-y divide-border">
            {data.historique.map((s) => {
              const st = STATUT_META[statutDe(s, 10)];
              return (
              <div key={s.id} className="group flex items-center justify-between gap-3 py-1.5 text-[0.8rem]">
                <span className="min-w-0 truncate font-semibold">{s.nom}</span>
                <span className="shrink-0 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[0.62rem] font-semibold" style={{ color: st.tone, background: `color-mix(in srgb,${st.tone} 12%,transparent)` }} title={st.label}><span>{st.icon}</span><span className="hidden sm:inline">{st.label}</span></span>
                <span className="shrink-0 text-faint">{dateFR(s.debut)} · {heureFR(s.debut)}{s.fin ? `–${heureFR(s.fin)}` : ""}</span>
                <span className="w-16 shrink-0 text-right font-num text-muted">{fmtMin(s.dureeMin || 0)}</span>
                <button onClick={() => supprimer(s.id)} className="shrink-0 text-faint opacity-0 transition hover:text-oxblood group-hover:opacity-100" aria-label="Supprimer"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
              );
            })}
          </div>
        </section>
      ) : null}
    </div>
  );
}
