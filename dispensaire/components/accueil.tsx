"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Clock, LogIn, LogOut, UserRound, Boxes, ShoppingBag, ReceiptText, Users } from "lucide-react";
import { prendreService, finService } from "@/app/actions";
import type { Salarie, Service, StockLigne, Resume } from "@/lib/data";
import { useAction } from "./ux";

function chrono(depuisISO: string, now: number) {
  const s = Math.max(0, Math.floor((now - new Date(depuisISO).getTime()) / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

function Stat({ href, k, v, icon, alerte }: { href: string; k: string; v: number; icon: React.ReactNode; alerte?: boolean }) {
  return (
    <Link href={href} className="stat" style={alerte && v > 0 ? { borderColor: "var(--oxblood)" } : undefined}>
      <span className="k">{icon}{k}</span>
      <span className="v" style={alerte && v > 0 ? { color: "var(--oxblood)" } : undefined}>{v}</span>
    </Link>
  );
}

export function Accueil({ salaries, services, alerte, resume }: { salaries: Salarie[]; services: Service[]; alerte: StockLigne[]; resume: Resume }) {
  const { run, isPending } = useAction();
  const [moi, setMoi] = useState("");
  const [saisie, setSaisie] = useState("");
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => { try { setMoi(localStorage.getItem("disp_moi") || ""); } catch {} }, []);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  function identifier(nom: string) { const n = nom.trim(); if (!n) return; setMoi(n); try { localStorage.setItem("disp_moi", n); } catch {} }

  const monService = services.find((s) => s.salarieNom.toLowerCase() === moi.trim().toLowerCase());

  return (
    <div className="flex flex-col gap-5">
      {/* Tableau de bord */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
        <Stat href="/stockage" k="Articles" v={resume.articles} icon={<Boxes className="h-3.5 w-3.5" />} />
        <Stat href="/stockage" k="En alerte" v={resume.alertes} icon={<AlertTriangle className="h-3.5 w-3.5" />} alerte />
        <Stat href="/" k="En service" v={resume.enService} icon={<Clock className="h-3.5 w-3.5" />} />
        <Stat href="/ventes" k="Bandages / sem." v={resume.ventesSemaine} icon={<ShoppingBag className="h-3.5 w-3.5" />} />
        <Stat href="/factures" k="Fact. en retard" v={resume.facturesRetard} icon={<ReceiptText className="h-3.5 w-3.5" />} alerte />
        <Stat href="/rh" k="Salariés" v={resume.salaries} icon={<Users className="h-3.5 w-3.5" />} />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <div className="flex flex-col gap-5">
          {/* Stocks en alerte */}
          <section className="rounded-[8px] border border-[var(--line)] bg-[var(--card)]">
            <div className="flex items-center gap-2 border-b border-[var(--line)] px-4 py-2.5">
              <AlertTriangle className="h-4 w-4" style={{ color: "var(--oxblood)" }} />
              <h2 className="font-display text-[1.05rem]">Stocks en alerte</h2>
              <span className="ml-auto rounded-full border border-[var(--line)] px-2 py-0.5 text-[0.7rem] tabnum text-[var(--muted)]">{alerte.length}</span>
            </div>
            {alerte.length === 0 ? (
              <p className="px-4 py-6 text-center text-[0.86rem] italic text-[var(--faint)]">Aucune alerte — les stocks sont au-dessus de leurs seuils.</p>
            ) : (
              <ul>
                {alerte.map((a) => (
                  <li key={a.id} className="rise flex items-center gap-3 border-b border-[var(--line)]/60 px-4 py-2 last:border-0">
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

          {/* En service */}
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

        {/* Prise de service */}
        <aside className="lg:sticky lg:top-4 lg:self-start">
          <section className="rounded-[8px] border border-[var(--line)] bg-[var(--card)] p-4">
            <h2 className="mb-1 font-display text-[1.05rem]">Prise de service</h2>
            <p className="mb-3 text-[0.78rem] text-[var(--muted)]">Pointe ton arrivée : le chrono compte tes heures. N&apos;oublie pas de terminer en partant.</p>

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
              <button onClick={() => run(() => finService(monService.id), "Service terminé — heures enregistrées.")} disabled={isPending} className="btn w-full justify-center" style={{ borderColor: "var(--oxblood)", color: "var(--oxblood)" }}>
                {isPending ? <span className="spin" /> : <LogOut className="h-4 w-4" />} Terminer · {chrono(monService.debut, now)}
              </button>
            ) : (
              <button onClick={() => moi.trim() ? run(() => prendreService(moi), "Bon service !") : undefined} disabled={isPending || !moi} className="btn-accent btn w-full justify-center disabled:opacity-50">
                {isPending ? <span className="spin" /> : <LogIn className="h-4 w-4" />} Prendre mon service
              </button>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
