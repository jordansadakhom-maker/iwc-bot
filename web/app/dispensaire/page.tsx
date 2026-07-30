import Link from "next/link";
import { ArrowRight, Boxes, FlaskConical, Receipt, FileText, BadgeDollarSign, Users, CalendarClock, Activity } from "lucide-react";
import { getAccueil } from "@/lib/dispensaire-accueil";
import { getRoleDispensaire, getConfig } from "@/lib/dispensaire-roles";
import { getConsigneDuJour } from "@/lib/dispensaire-consignes";
import { getRendezVous } from "@/lib/dispensaire-rendez-vous";
import { ymdParis } from "@/lib/dispensaire-dates";
import { DISP_NAV } from "@/lib/dispensaire-nav";
import { isStandalone } from "@/lib/standalone-server";
import { AccueilService } from "@/components/dispensaire-accueil-service";
import { DispensaireConsignes } from "@/components/dispensaire-consignes";
import { StatWidget } from "@/components/dispensaire-premium";
import { DispensaireTimeline } from "@/components/dispensaire-timeline";
import { DiagBoundary } from "@/components/diag-boundary";
import { enregistrerConsigne } from "@/app/dispensaire/consignes-actions";

export const dynamic = "force-dynamic";

const money = (n: number) => `$${Math.round(n).toLocaleString("fr-FR")}`;

// ⚠️ DIAGNOSTIC TEMPORAIRE — capture et affiche l'erreur réelle de rendu du
// tableau de bord (à retirer une fois le bug identifié).
function DiagBox({ where, e }: { where: string; e: unknown }) {
  const err = e as { message?: string; stack?: string };
  return (
    <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", padding: 16, margin: 12, border: "2px solid #e5484d", borderRadius: 10, background: "#1a1113", color: "#ffd7d7", fontSize: 12, lineHeight: 1.5 }}>
      {`🔧 DIAGNOSTIC (temporaire) — ${where}\n\nMESSAGE: ${err?.message ?? String(e)}\n\nSTACK:\n${err?.stack ?? "(pas de stack disponible)"}`}
    </pre>
  );
}

export default async function DispensaireAccueil() {
  try {
    const [d, role, standalone, consigne, cfg, rdv] = await Promise.all([getAccueil(), getRoleDispensaire(), isStandalone(), getConsigneDuJour(), getConfig(), getRendezVous()]);
    const habilite = role.perms.rh || role.perms.factures || role.perms.admin;
    const modules = DISP_NAV.filter((t) => t.href !== "/dispensaire" && !t.direction && (!t.restreint || habilite) && !(standalone && t.href === "/repertoire"));

    const todayYmd = ymdParis(new Date().toISOString());
    const rdvAujourdhui = (rdv?.aVenir || []).filter((r) => { try { return ymdParis(r.debut) === todayYmd; } catch { return false; } }).length;
    const stockCrit = d.stockAlertes.length;
    const matRupture = d.matieresRupture.length;

    return (
      <DiagBoundary where="Tableau de bord (rendu)">
      <div className="flex flex-col gap-5">
        {/* Cockpit — widgets clés (compteurs animés, cliquables). */}
        <div className="disp-rise grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
          <StatWidget label="Médecins en service" value={d.enService.length} icon={Users} tone="good" live href="/dispensaire/pointage" sous={d.enService.length ? d.enService.slice(0, 2).map((s) => s.nom).join(" · ") : "Personne en service"} />
          <StatWidget label="RDV aujourd'hui" value={rdvAujourdhui} icon={CalendarClock} href="/dispensaire/rendez-vous" sous={rdvAujourdhui ? "Consultations prévues" : "Aucun rendez-vous"} />
          <StatWidget label="Soins du jour" value={d.ventesJourNb} icon={Activity} tone="good" href="/dispensaire/ventes" sous={`Recette ${money(d.ventesJourCa)}`} />
          <StatWidget label="Stocks critiques" value={stockCrit} icon={Boxes} tone={stockCrit ? "crit" : "steel"} href="/dispensaire/stockage" sous={stockCrit ? d.stockAlertes.slice(0, 2).map((s) => s.nom).join(" · ") : "Tout au-dessus du seuil"} />
          <StatWidget label="Matières en rupture" value={matRupture} icon={FlaskConical} tone={matRupture ? "crit" : "steel"} href="/dispensaire/matieres" sous={matRupture ? d.matieresRupture.slice(0, 2).map((m) => m.nom).join(" · ") : "Rien à commander"} />
          <StatWidget label="Frais en attente" value={d.fraisEnAttente} icon={FileText} tone={d.fraisEnAttente ? "warn" : "steel"} href="/dispensaire/frais" sous={d.fraisEnAttente ? "À valider" : "Rien en attente"} />
          {d.habilite ? <StatWidget label="Factures impayées" value={d.facturesImpayees} icon={Receipt} tone={d.facturesRetard ? "crit" : "warn"} href="/dispensaire/factures" sous={`${d.facturesRetard} en retard · ${money(d.du)} dû`} /> : null}
          <StatWidget label="Recette du jour" value={d.ventesJourCa} format={money} icon={BadgeDollarSign} tone="good" href="/dispensaire/ventes" sous="Ventes encaissées aujourd'hui" />
        </div>

        {/* Consignes du jour (objectifs) — éditables par les responsables */}
        <DispensaireConsignes data={consigne} canEdit={habilite} onSave={enregistrerConsigne} />

        {/* Personnel en service (live) + prise de service */}
        <AccueilService enService={d.enService} roster={d.roster} inactiviteMin={cfg.pointageInactiviteMin} />

        {/* Dernières activités — timeline temps réel (horodatage relatif vivant) */}
        <DispensaireTimeline items={d.activites} />

        {/* Accès aux modules */}
        <div>
          <div className="mb-2 text-[0.72rem] font-semibold uppercase tracking-[0.06em] text-faint">Modules du dispensaire</div>
          <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
            {modules.map((t) => {
              const Icon = t.icon;
              return (
                <Link key={t.href} href={t.href} className="disp-lift flex items-center gap-3 rounded-[14px] border border-border bg-surface p-3 shadow-card transition">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg" style={{ background: "color-mix(in srgb,var(--accent) 14%,transparent)" }}><Icon className="h-4 w-4 text-accent" /></span>
                  <span className="min-w-0 flex-1"><span className="block text-[0.86rem] font-semibold">{t.label}</span><span className="text-[0.68rem] text-faint">Ouvrir</span></span>
                  <ArrowRight className="h-4 w-4 text-faint" />
                </Link>
              );
            })}
          </div>
        </div>
      </div>
      </DiagBoundary>
    );
  } catch (e) {
    return <DiagBox where="Tableau de bord (page)" e={e} />;
  }
}
