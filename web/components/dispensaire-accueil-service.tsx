"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Play, Square, Loader2, Users } from "lucide-react";
import type { ServiceEnCours } from "@/lib/dispensaire-accueil";
import { inputCls } from "@/components/edit-ui";
import { prendreService, terminerService } from "@/app/dispensaire/pointage/actions";

const heureFR = (iso: string) => { try { return new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" }).format(new Date(iso)); } catch { return "—"; } };
function fmtMin(min: number) { if (min <= 0) return "0 min"; const h = Math.floor(min / 60), m = min % 60; return h ? `${h} h ${String(m).padStart(2, "0")}` : `${m} min`; }

// Tableau de bord — personnel en service (chrono live) + prise / fin de service.
export function AccueilService({ enService, roster }: { enService: ServiceEnCours[]; roster: { id: string; nom: string; grade: string | null }[] }) {
  const router = useRouter();
  const [liste, setListe] = useState<ServiceEnCours[]>(enService);
  const [choix, setChoix] = useState("");
  const [manuel, setManuel] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => { setListe(enService); }, [enService]);
  useEffect(() => {
    if (!liste.length) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [liste.length]);

  async function commencer() {
    const nomManuel = manuel.trim();
    const sal = roster.find((r) => r.id === choix);
    const nom = nomManuel || sal?.nom || "";
    if (!nom) { setErr("Choisis un salarié ou saisis un nom."); return; }
    if (liste.some((s) => s.nom.toLowerCase() === nom.toLowerCase())) { setErr(`${nom} est déjà en service.`); return; }
    setErr(null); setBusy(true);
    const tmp: ServiceEnCours = { id: "tmp-" + Math.random().toString(36).slice(2, 8), nom, grade: nomManuel ? null : sal?.grade ?? null, debut: new Date().toISOString() };
    setListe((p) => [...p, tmp]); setChoix(""); setManuel("");
    const r = await prendreService({ salarieId: nomManuel ? null : sal?.id ?? null, nom });
    setBusy(false);
    if (!r.ok) { setListe((p) => p.filter((s) => s.id !== tmp.id)); setErr(r.error || "Impossible."); }
    else { setListe((p) => p.map((s) => (s.id === tmp.id ? { ...s, id: r.id || tmp.id } : s))); router.refresh(); }
  }
  async function terminer(s: ServiceEnCours) {
    setListe((p) => p.filter((x) => x.id !== s.id));
    const r = await terminerService(s.id);
    if (!r.ok) { setListe((p) => [...p, s]); setErr(r.error || "Impossible."); } else router.refresh();
  }

  return (
    <section className="rounded-[14px] border border-border bg-surface p-4">
      <div className="mb-3 flex items-center gap-2">
        <h3 className="flex items-center gap-2 text-[0.9rem] font-semibold"><Users className="h-4 w-4 text-accent" /> Personnel en service</h3>
        <span className="rounded-full px-2 py-0.5 text-[0.68rem] font-bold" style={{ color: liste.length ? "var(--good)" : "var(--faint)", background: liste.length ? "color-mix(in srgb,var(--good) 14%,transparent)" : "transparent" }}>{liste.length}</span>
      </div>

      {/* Prise de service */}
      <div className="mb-3 flex flex-wrap items-end gap-2">
        <select className={inputCls + " min-w-[150px] flex-1"} value={choix} onChange={(e) => { setChoix(e.target.value); setManuel(""); }} disabled={busy}>
          <option value="">{roster.length ? "— Choisir un salarié —" : "Aucun salarié (voir RH)"}</option>
          {roster.map((r) => <option key={r.id} value={r.id}>{r.nom}{r.grade ? ` · ${r.grade}` : ""}</option>)}
        </select>
        <input className={inputCls + " min-w-[130px] flex-1"} value={manuel} onChange={(e) => { setManuel(e.target.value); if (e.target.value) setChoix(""); }} placeholder="ou saisir un nom" disabled={busy} />
        <button onClick={commencer} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[0.8rem] font-semibold text-black/85 disabled:opacity-60" style={{ background: "var(--accent)" }}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" strokeWidth={2.2} />} Prise de service</button>
      </div>
      {err ? <p className="mb-2 text-[0.76rem]" style={{ color: "var(--oxblood)" }}>{err}</p> : null}

      {liste.length === 0 ? (
        <p className="py-6 text-center text-[0.85rem] italic text-faint">Personne en service pour l&apos;instant.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[0.8rem]">
            <thead><tr className="border-b border-border text-[0.66rem] uppercase tracking-[0.04em] text-faint">
              <th className="py-1.5 pr-2 font-semibold">Nom</th><th className="px-2 py-1.5 font-semibold">Grade</th><th className="px-2 py-1.5 font-semibold">Début</th><th className="px-2 py-1.5 font-semibold">Temps</th><th className="px-2 py-1.5 font-semibold">Statut</th><th className="py-1.5"></th>
            </tr></thead>
            <tbody>
              {liste.map((s) => {
                const live = now != null ? Math.max(0, Math.round((now - new Date(s.debut).getTime()) / 60000)) : null;
                return (
                  <tr key={s.id} className="border-b border-border/60">
                    <td className="py-2 pr-2 font-semibold">{s.nom}</td>
                    <td className="px-2 py-2 text-muted">{s.grade || "—"}</td>
                    <td className="px-2 py-2 font-num text-faint">{heureFR(s.debut)}</td>
                    <td className="px-2 py-2 font-num" style={{ color: "var(--ink)" }}>{live != null ? fmtMin(live) : "…"}</td>
                    <td className="px-2 py-2"><span className="inline-flex items-center gap-1 text-[0.72rem] font-semibold" style={{ color: "var(--good)" }}><span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--good)" }} /> En service</span></td>
                    <td className="py-2 text-right"><button onClick={() => terminer(s)} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[0.72rem] font-semibold text-muted hover:text-ink"><Square className="h-3 w-3" /> Fin</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
