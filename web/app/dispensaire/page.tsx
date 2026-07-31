import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getAccueil } from "@/lib/dispensaire-accueil";
import { getRoleDispensaire, getConfig } from "@/lib/dispensaire-roles";
import { getConsigneDuJour } from "@/lib/dispensaire-consignes";
import { getRendezVous } from "@/lib/dispensaire-rendez-vous";
import { ymdParis } from "@/lib/dispensaire-dates";
import { DISP_NAV } from "@/lib/dispensaire-nav";
import { isStandalone } from "@/lib/standalone-server";
import { AccueilService } from "@/components/dispensaire-accueil-service";
import { DispensaireConsignes } from "@/components/dispensaire-consignes";
import { DispensaireAccueilCockpit } from "@/components/dispensaire-accueil-cockpit";
import { DispensaireTimeline } from "@/components/dispensaire-timeline";
import { getDashboardPrefs } from "@/lib/dispensaire-dashboard-prefs";
import { enregistrerConsigne } from "@/app/dispensaire/consignes-actions";
import { enregistrerDashboardPrefs } from "@/app/dispensaire/dashboard-actions";

export const dynamic = "force-dynamic";

export default async function DispensaireAccueil() {
  const [d, role, standalone, consigne, cfg, rdv] = await Promise.all([getAccueil(), getRoleDispensaire(), isStandalone(), getConsigneDuJour(), getConfig(), getRendezVous()]);
  const habilite = role.perms.rh || role.perms.factures || role.perms.admin;
  const prefs = await getDashboardPrefs(role.identifiant);
  const modules = DISP_NAV.filter((t) => t.href !== "/dispensaire" && !t.direction && (!t.restreint || habilite) && !(standalone && t.href === "/repertoire"));

  const todayYmd = ymdParis(new Date().toISOString());
  const rdvAujourdhui = (rdv?.aVenir || []).filter((r) => { try { return ymdParis(r.debut) === todayYmd; } catch { return false; } }).length;

  return (
    <div className="flex flex-col gap-5">
      {/* Cockpit — widgets clés (compteurs animés, cliquables). Rendu dans un
          composant CLIENT : icônes & formateurs ne traversent pas la frontière RSC. */}
      <DispensaireAccueilCockpit d={d} rdvAujourdhui={rdvAujourdhui} ordre={prefs.ordre} masques={prefs.masques} onSave={enregistrerDashboardPrefs} />

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
  );
}
