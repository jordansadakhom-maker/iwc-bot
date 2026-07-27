import Link from "next/link";
import { LayoutDashboard, Wallet, HeartPulse, CalendarClock, Scissors, Users, Boxes, TrendingDown, ScrollText, ArrowRight, Lock, RefreshCw, BedDouble } from "lucide-react";
import { money } from "@/lib/dispensaire-facturation-const";
import { Cartouche } from "@/components/dispensaire-ui";
import { RealtimeRefresh } from "@/components/realtime-refresh";
import type { CockpitData } from "@/lib/dispensaire-cockpit";

const heureFR = (iso: string) => { try { return new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" }).format(new Date(iso)); } catch { return "—"; } };
const jourHeure = (iso: string) => { try { return new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso)); } catch { return "—"; } };

function Bloc({ titre, icon: Icon, href, children }: { titre: string; icon: typeof Users; href?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[14px] border border-border bg-surface p-4">
      <div className="mb-2 flex items-center gap-2">
        <h3 className="flex items-center gap-2 text-[0.88rem] font-semibold"><Icon className="h-4 w-4 text-accent" /> {titre}</h3>
        {href ? <Link href={href} className="ml-auto inline-flex items-center gap-0.5 text-[0.72rem] font-semibold text-faint transition hover:text-accent">Ouvrir <ArrowRight className="h-3 w-3" /></Link> : null}
      </div>
      {children}
    </section>
  );
}

export function DispensaireCockpit({ data }: { data: CockpitData }) {
  if (!data.canVoir) return (
    <div className="rounded-[14px] border border-border bg-surface p-8 text-center">
      <Lock className="mx-auto h-6 w-6 text-faint" />
      <p className="mt-2 text-[0.9rem] text-muted">Le cockpit de direction est réservé à l&apos;administration du dispensaire.</p>
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      <RealtimeRefresh fallbackSeconds={60} />

      <div className="flex items-center gap-2">
        <h2 className="flex items-center gap-2 font-display text-[1.15rem]"><LayoutDashboard className="h-5 w-5 text-accent" /> Cockpit de direction</h2>
        <span className="ml-auto inline-flex items-center gap-1 text-[0.7rem] text-faint"><RefreshCw className="h-3 w-3" /> temps réel · {heureFR(data.genereLe)}</span>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4 xl:grid-cols-7">
        <Cartouche label="Trésorerie" valeur={money(data.tresorerie)} ton={data.tresorerie >= 0 ? "var(--good)" : "var(--oxblood)"} icon={Wallet} />
        <Cartouche label="Solde du mois" valeur={money(data.moisSolde)} ton={data.moisSolde >= 0 ? "var(--good)" : "var(--oxblood)"} icon={Wallet} />
        <Cartouche label="En charge" valeur={data.pecEnCours} ton="var(--accent)" icon={HeartPulse} />
        <Cartouche label="Lits occupés" valeur={`${data.chambresOccupees}/${data.chambresTotal}`} ton={data.chambresOccupees ? "var(--oxblood)" : undefined} icon={BedDouble} />
        <Cartouche label="RDV aujourd'hui" valeur={data.rdvAujourdhui} icon={CalendarClock} />
        <Cartouche label="Interventions" valeur={data.intervEnCours} ton={data.intervEnCours ? "var(--oxblood)" : undefined} icon={Scissors} />
        <Cartouche label="En service" valeur={data.enService.length} ton={data.enService.length ? "var(--good)" : undefined} icon={Users} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Personnel en service */}
        <Bloc titre="Personnel en service" icon={Users} href="/dispensaire/pointage">
          {data.enService.length === 0 ? <p className="py-2 text-[0.82rem] italic text-faint">Personne en service.</p> : (
            <div className="flex flex-col divide-y divide-border/60">
              {data.enService.map((s) => (
                <div key={s.nom + s.debut} className="flex items-center gap-2 py-1.5 text-[0.82rem]">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--good)" }} />
                  <span className="min-w-0 flex-1 truncate font-semibold">{s.nom}</span>
                  {s.grade ? <span className="shrink-0 text-faint">{s.grade}</span> : null}
                  <span className="shrink-0 font-num text-faint">depuis {heureFR(s.debut)}</span>
                </div>
              ))}
            </div>
          )}
        </Bloc>

        {/* Prises en charge */}
        <Bloc titre="Prises en charge" icon={HeartPulse} href="/dispensaire/prises-en-charge">
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-[11px] border border-border bg-surface-2 p-3 text-center"><div className="font-num text-[1.5rem] font-bold" style={{ color: "var(--warn)" }}>{data.pecAdmis}</div><div className="text-[0.72rem] text-faint">Admis (en attente)</div></div>
            <div className="rounded-[11px] border border-border bg-surface-2 p-3 text-center"><div className="font-num text-[1.5rem] font-bold" style={{ color: "var(--accent)" }}>{data.pecEnSoin}</div><div className="text-[0.72rem] text-faint">En soin</div></div>
          </div>
        </Bloc>

        {/* Prochains RDV */}
        <Bloc titre="Prochains rendez-vous" icon={CalendarClock} href="/dispensaire/rendez-vous">
          {data.prochainsRdv.length === 0 ? <p className="py-2 text-[0.82rem] italic text-faint">Aucun rendez-vous à venir.</p> : (
            <div className="flex flex-col divide-y divide-border/60">
              {data.prochainsRdv.map((r, i) => (
                <div key={i} className="flex items-center gap-2 py-1.5 text-[0.82rem]">
                  <span className="shrink-0 font-num text-faint">{jourHeure(r.debut)}</span>
                  <span className="min-w-0 flex-1 truncate"><b className="font-semibold">{r.patient}</b>{r.type ? <span className="text-faint"> · {r.type}</span> : ""}</span>
                  {r.medecin ? <span className="shrink-0 text-faint">{r.medecin}</span> : null}
                </div>
              ))}
            </div>
          )}
        </Bloc>

        {/* Stock & ruptures */}
        <Bloc titre="Stock & ruptures" icon={Boxes} href="/dispensaire/stockage">
          <div className="mb-2 grid grid-cols-3 gap-2">
            <div className="rounded-[11px] border border-border bg-surface-2 p-2.5 text-center"><div className="font-num text-[1.25rem] font-bold" style={{ color: data.stockAlertes ? "var(--oxblood)" : "var(--ink)" }}>{data.stockAlertes}</div><div className="text-[0.68rem] text-faint">Sous seuil</div></div>
            <div className="rounded-[11px] border border-border bg-surface-2 p-2.5 text-center"><div className="font-num text-[1.25rem] font-bold" style={{ color: data.matieresRupture ? "var(--warn)" : "var(--ink)" }}>{data.matieresRupture}</div><div className="text-[0.68rem] text-faint">Matières basses</div></div>
            <div className="rounded-[11px] border border-border bg-surface-2 p-2.5 text-center"><div className="font-num text-[1.25rem] font-bold" style={{ color: data.ruptureBientot ? "var(--oxblood)" : "var(--ink)" }}>{data.ruptureBientot}</div><div className="text-[0.68rem] text-faint">Ruptures proches</div></div>
          </div>
          {data.topRupture.length ? (
            <div className="flex flex-col gap-1 text-[0.8rem]">
              {data.topRupture.map((t) => (
                <div key={t.nom} className="flex items-center gap-2"><TrendingDown className="h-3.5 w-3.5 text-oxblood" /><span className="min-w-0 flex-1 truncate">{t.nom}</span><span className="shrink-0 font-num font-semibold" style={{ color: "var(--oxblood)" }}>{t.joursRestants == null ? "épuisé" : `${t.joursRestants} j`}</span></div>
              ))}
            </div>
          ) : null}
        </Bloc>
      </div>

      {/* Activité du jour + finances */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <Cartouche label="Ventes du jour" valeur={data.ventesJourNb} icon={Boxes} />
        <Cartouche label="Recette du jour" valeur={money(data.ventesJourCa)} ton="var(--good)" icon={Wallet} />
        <Cartouche label="Factures impayées" valeur={data.facturesImpayees} ton={data.facturesImpayees ? "var(--oxblood)" : undefined} icon={Wallet} />
        <Cartouche label="Créances dues" valeur={money(data.du)} ton={data.du ? "var(--oxblood)" : undefined} icon={Wallet} />
      </div>

      {/* Dernières actions */}
      <Bloc titre="Dernières actions" icon={ScrollText} href="/dispensaire/admin">
        {data.journal.length === 0 ? <p className="py-2 text-[0.82rem] italic text-faint">Journal d&apos;audit vide ou non activé.</p> : (
          <div className="flex flex-col divide-y divide-border/60">
            {data.journal.map((e) => (
              <div key={e.id} className="flex items-center gap-2 py-1.5 text-[0.8rem]">
                <span className="min-w-0 flex-1 truncate">{e.action}{e.cible ? <span className="text-faint"> · {e.cible}</span> : ""}</span>
                <span className="shrink-0 text-faint">{e.par || "—"}</span>
                <span className="shrink-0 font-num text-faint">{heureFR(e.at)}</span>
              </div>
            ))}
          </div>
        )}
      </Bloc>
    </div>
  );
}
