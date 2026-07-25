"use client";

import { Landmark, TrendingUp, Receipt, Wallet, ArrowUpRight, ArrowDownRight, Gauge, AlertTriangle } from "lucide-react";
import { euros, pourcent, calculFiscal, simulerFiscal, SEUIL_MAX, type CycleFiscal } from "@/lib/armurerie-fiscal";

// ── Tableau de bord fiscal ────────────────────────────────────────────────────
// Tout est dérivé du cycle réel (bénéfice = flux net du coffre) et de la grille.
// Aucune saisie, aucun bouton « recalculer » : l'écran reflète l'état courant.
export function FiscalDashboard({ cycle }: { cycle: CycleFiscal }) {
  const auMax = cycle.seuilTranche === SEUIL_MAX;
  const trancheLabel = cycle.seuilTranche == null ? "Aucune (sous 1 800 $)" : `≥ ${euros(cycle.seuilTranche)} → ${pourcent(cycle.taux)}`;

  return (
    <section className="rounded-[14px] border p-4" style={{ borderColor: "color-mix(in srgb,var(--accent) 30%,var(--border))", background: "color-mix(in srgb,var(--accent) 5%,transparent)" }}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Gauge className="h-4 w-4" style={{ color: "var(--accent)" }} />
        <h3 className="text-[0.9rem] font-semibold">Situation fiscale — cycle en cours</h3>
        <span className="ml-auto text-[0.68rem] text-faint">Calcul automatique sur le bénéfice · grille officielle</span>
      </div>

      {/* Bénéfice → tranche → impôt → net, la chaîne du cahier des charges. */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <Tuile label="Bénéfice du cycle" valeur={euros(cycle.benefice)} tone="var(--brass)" icon={TrendingUp} gros />
        <Tuile label="Tranche appliquée" valeur={cycle.seuilTranche == null ? "0 %" : pourcent(cycle.taux)} sous={trancheLabel} tone="var(--accent)" icon={Landmark} />
        <Tuile label="Impôts dus" valeur={euros(cycle.impot)} tone="var(--oxblood)" icon={Receipt} />
        <Tuile label="Bénéfice net" valeur={euros(cycle.net)} tone="var(--good)" icon={Wallet} gros />
      </div>

      {/* Détail du bénéfice : entrées (CA) − sorties (achats/dépenses). */}
      <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-[10px] border border-border bg-surface-2 px-3 py-2 text-[0.76rem]">
        <span className="inline-flex items-center gap-1 text-muted"><ArrowUpRight className="h-3.5 w-3.5" style={{ color: "var(--good)" }} /> Entrées (CA) <b className="font-num text-ink">{euros(cycle.ca)}</b></span>
        <span className="inline-flex items-center gap-1 text-muted"><ArrowDownRight className="h-3.5 w-3.5" style={{ color: "var(--oxblood)" }} /> Achats &amp; dépenses <b className="font-num text-ink">{euros(cycle.depenses)}</b></span>
        <span className="inline-flex items-center gap-1 text-muted">= Bénéfice réel <b className="font-num text-ink">{euros(cycle.benefice)}</b></span>
      </div>

      {/* Progression vers la prochaine tranche. */}
      <div className="mt-3">
        {auMax ? (
          <p className="text-[0.78rem] font-semibold" style={{ color: "var(--oxblood)" }}>Tranche maximale atteinte (40 %).</p>
        ) : cycle.prochainSeuil != null ? (
          <>
            <div className="mb-1 flex items-center justify-between text-[0.74rem]">
              <span className="text-muted">Prochaine tranche : <b className="text-ink">{euros(cycle.prochainSeuil)}</b>{cycle.tauxProchain != null ? <span className="text-faint"> ({pourcent(cycle.tauxProchain)})</span> : null}</span>
              <span className="font-num font-semibold" style={{ color: "var(--warn)" }}>encore {euros(cycle.resteAvantProchain || 0)}</span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full" style={{ background: "color-mix(in srgb,var(--accent) 14%,transparent)" }}>
              <div className="h-full rounded-full transition-all" style={{ width: `${Math.round(cycle.progression * 100)}%`, background: "linear-gradient(90deg,var(--accent),var(--brass))" }} />
            </div>
          </>
        ) : null}
      </div>
    </section>
  );
}

function Tuile({ label, valeur, sous, tone, icon: Icon, gros }: { label: string; valeur: string; sous?: string; tone: string; icon: typeof Landmark; gros?: boolean }) {
  return (
    <div className="rounded-[12px] border border-border bg-surface px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[0.64rem] uppercase tracking-[0.05em] text-faint"><Icon className="h-3.5 w-3.5" style={{ color: tone }} /> {label}</div>
      <div className={`mt-1 font-num font-bold ${gros ? "text-[1.25rem]" : "text-[1.05rem]"}`} style={{ color: tone }}>{valeur}</div>
      {sous ? <div className="mt-0.5 text-[0.64rem] text-faint">{sous}</div> : null}
    </div>
  );
}

// ── Simulateur en caisse : impact fiscal d'une vente AVANT validation ─────────
// Affiche, si le panier est encaissé, le nouveau bénéfice/tranche/impôt/net.
export function SimulateurFiscal({ beneficeCycle, beneficeVente }: { beneficeCycle: number; beneficeVente: number }) {
  if (!(beneficeVente > 0)) return null;
  const sim = simulerFiscal(beneficeCycle, beneficeVente);
  const alerte = sim.changeTranche && sim.projete.taux > sim.actuel.taux;
  return (
    <div className="rounded-[10px] border px-2.5 py-2 text-[0.72rem]" style={{ borderColor: alerte ? "color-mix(in srgb,var(--warn) 55%,var(--border))" : "color-mix(in srgb,var(--accent) 35%,var(--border))", background: alerte ? "color-mix(in srgb,var(--warn) 8%,transparent)" : "color-mix(in srgb,var(--accent) 6%,transparent)" }}>
      <div className="mb-1 flex items-center gap-1 font-semibold text-muted">
        {alerte ? <AlertTriangle className="h-3.5 w-3.5" style={{ color: "var(--warn)" }} /> : <Gauge className="h-3.5 w-3.5" style={{ color: "var(--accent)" }} />}
        Si encaissée : impôt {euros(sim.actuel.impot)} → <b className="text-ink">{euros(sim.projete.impot)}</b>
        {sim.deltaImpot > 0 ? <span style={{ color: "var(--oxblood)" }}>(+{euros(sim.deltaImpot)})</span> : null}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-faint">
        <span>Bénéfice <b className="font-num text-ink">{euros(sim.projete.benefice)}</b></span>
        <span>Tranche <b className="font-num text-ink">{sim.projete.seuilTranche == null ? "0 %" : pourcent(sim.projete.taux)}</b></span>
        <span>Net <b className="font-num text-ink">{euros(sim.projete.net)}</b></span>
      </div>
      {alerte ? <div className="mt-1 font-semibold" style={{ color: "var(--warn)" }}>⚠ Cette vente fait passer la tranche supérieure.</div> : null}
    </div>
  );
}

// Ré-export utilitaire pour les appels ponctuels côté client.
export { calculFiscal };
