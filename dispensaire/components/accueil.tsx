"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Clock, LogIn, LogOut, UserRound } from "lucide-react";
import { prendreService, finService } from "@/app/actions";
import type { Salarie, Service, StockLigne } from "@/lib/data";

function hm(min: number) { const h = Math.floor(min / 60), m = min % 60; return h ? `${h} h ${String(m).padStart(2, "0")}` : `${m} min`; }
function chrono(depuisISO: string, now: number) {
  const s = Math.max(0, Math.floor((now - new Date(depuisISO).getTime()) / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

export function Accueil({ salaries, services, alerte }: { salaries: Salarie[]; services: Service[]; alerte: StockLigne[] }) {
  const router = useRouter();
  const [moi, setMoi] = useState("");
  const [saisie, setSaisie] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => { try { setMoi(localStorage.getItem("disp_moi") || ""); } catch {} }, []);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  function identifier(nom: string) { const n = nom.trim(); if (!n) return; setMoi(n); try { localStorage.setItem("disp_moi", n); } catch {} }

  const monService = services.find((s) => s.salarieNom.toLowerCase() === moi.trim().toLowerCase());

  async function prendre() {
    if (!moi.trim()) { setFlash("Indique d'abord ton nom."); return; }
    setBusy(true); const r = await prendreService(moi); setBusy(false);
    if (!r.ok) { setFlash(r.error || "Échec."); return; }
    setFlash(null); router.refresh();
  }
  async function terminer() {
    if (!monService) return;
    setBusy(true); const r = await finService(monService.id); setBusy(false);
    if (!r.ok) { setFlash(r.error || "Échec."); return; }
    setFlash(null); router.refresh();
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
      {/* Colonne principale */}
      <div className="flex flex-col gap-5">
        {/* Stocks en alerte */}
        <section className="rounded-[8px] border border-[var(--line)] bg-[var(--card)]">
          <div className="flex items-center gap-2 border-b border-[var(--line)] px-4 py-2.5">
            <AlertTriangle className="h-4 w-4" style={{ color: "var(--oxblood)" }} />
            <h2 className="font-display text-[1.05rem]">Stocks en alerte</h2>
            <span className="ml-auto rounded-full border border-[var(--line)] px-2 py-0.5 text-[0.7rem] tabnum text-[var(--muted)]">{alerte.length}</span>
          </div>
          {alerte.length === 0 ? (
            <p className="px-4 py-6 text-center text-[0.86rem] italic text-[var(--faint)]">Aucune alerte — les stocks sont au-dessus de leurs seuils (à définir dans l&apos;onglet Stockage).</p>
          ) : (
            <ul>
              {alerte.map((a) => (
                <li key={a.id} className="flex items-center gap-3 border-b border-[var(--line)]/60 px-4 py-2 last:border-0">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: a.quantite === 0 ? "var(--oxblood)" : "var(--warn)" }} />
                  <span className="min-w-0 flex-1 truncate font-medium">{a.nom}{a.lieu ? <span className="text-[0.76rem] text-[var(--faint)]"> · {a.lieu}</span> : null}</span>
                  <span className="text-[0.72rem] uppercase tracking-wide text-[var(--faint)]">{a.categorie}</span>
                  <span className="tabnum text-[0.9rem] font-bold" style={{ color: a.quantite === 0 ? "var(--oxblood)" : "var(--warn)" }}>{a.quantite}{a.unite ? " " + a.unite : ""}</span>
                  <span className="text-[0.72rem] text-[var(--faint)]">/ seuil {a.seuil}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Salariés en service */}
        <section className="rounded-[8px] border border-[var(--line)] bg-[var(--card)]">
          <div className="flex items-center gap-2 border-b border-[var(--line)] px-4 py-2.5">
            <Clock className="h-4 w-4" style={{ color: "var(--good)" }} />
            <h2 className="font-display text-[1.05rem]">En service</h2>
            <span className="ml-auto rounded-full border border-[var(--line)] px-2 py-0.5 text-[0.7rem] tabnum text-[var(--muted)]">{services.length}</span>
          </div>
          {services.length === 0 ? (
            <p className="px-4 py-6 text-center text-[0.86rem] italic text-[var(--faint)]">Personne en service pour le moment.</p>
          ) : (
            <ul>
              {services.map((s) => (
                <li key={s.id} className="flex items-center gap-3 border-b border-[var(--line)]/60 px-4 py-2.5 last:border-0">
                  <UserRound className="h-4 w-4 text-[var(--muted)]" />
                  <span className="min-w-0 flex-1 truncate font-medium">{s.salarieNom}</span>
                  <span className="tabnum text-[1rem] font-bold" style={{ color: "var(--good)" }}>{chrono(s.debut, now)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Colonne prise de service */}
      <aside className="lg:sticky lg:top-4 lg:self-start">
        <section className="rounded-[8px] border border-[var(--line)] bg-[var(--card)] p-4">
          <h2 className="mb-1 font-display text-[1.05rem]">Prise de service</h2>
          <p className="mb-3 text-[0.78rem] text-[var(--muted)]">Pointe ton arrivée : le chrono compte tes heures. N&apos;oublie pas de terminer ton service en partant.</p>

          <label className="mb-1 block text-[0.68rem] uppercase tracking-[0.08em] text-[var(--faint)]">Ton nom</label>
          {salaries.length ? (
            <select className="inp mb-2" value={moi} onChange={(e) => identifier(e.target.value)}>
              <option value="">— Choisis ton nom —</option>
              {salaries.map((sa) => <option key={sa.id} value={sa.nom}>{sa.nom}</option>)}
            </select>
          ) : (
            <div className="mb-2 flex gap-2">
              <input className="inp" value={saisie} onChange={(e) => setSaisie(e.target.value)} placeholder="Prénom Nom" onKeyDown={(e) => { if (e.key === "Enter") identifier(saisie); }} />
              <button className="btn" onClick={() => identifier(saisie)}>OK</button>
            </div>
          )}
          {moi ? <p className="mb-3 text-[0.8rem]">Identifié : <b>{moi}</b></p> : null}

          {monService ? (
            <button onClick={terminer} disabled={busy} className="btn w-full justify-center" style={{ borderColor: "var(--oxblood)", color: "var(--oxblood)" }}>
              <LogOut className="h-4 w-4" /> Terminer mon service · {chrono(monService.debut, now)}
            </button>
          ) : (
            <button onClick={prendre} disabled={busy || !moi} className="btn-accent btn w-full justify-center disabled:opacity-50">
              <LogIn className="h-4 w-4" /> Prendre mon service
            </button>
          )}
          {flash ? <p className="mt-2 text-[0.78rem]" style={{ color: "var(--oxblood)" }}>{flash}</p> : null}
        </section>
      </aside>
    </div>
  );
}
