import Link from "next/link";
import { ArrowRight, Crown } from "lucide-react";
import { getRoleDispensaire } from "@/lib/dispensaire-roles";
import { DISP_DIRECTION, aPermDirection } from "@/lib/dispensaire-nav";
import { AccesDirection } from "@/components/dispensaire-acces-direction";

export const dynamic = "force-dynamic";

// Espace Direction — hub sécurisé regroupant les outils réservés (pilotage, RH,
// paie, comptabilité, réglages, audit). N'affiche QUE les outils que le grade du
// compte peut réellement ouvrir. Un compte sans aucun droit Direction (même en
// tapant l'URL) tombe sur l'écran de refus : rien n'est exposé.
export default async function DispensaireDirectionHub() {
  const role = await getRoleDispensaire();
  const outils = DISP_DIRECTION.filter((t) => aPermDirection(role.perms, t.perm));

  if (!outils.length) {
    return <AccesDirection sous="L'espace Direction est réservé au personnel habilité (RH, comptabilité ou direction). Ton grade n'y donne pas accès." />;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-3 rounded-[14px] border border-border bg-surface-2 p-4">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full" style={{ background: "color-mix(in srgb,var(--accent) 15%,transparent)" }}>
          <Crown className="h-5 w-5 text-accent" />
        </span>
        <div>
          <div className="text-[0.95rem] font-semibold">Espace Direction</div>
          <p className="text-[0.8rem] leading-relaxed text-muted">Les outils de pilotage et de gestion, réunis et protégés. Seuls les grades habilités y accèdent — chaque outil applique en plus sa propre permission.</p>
        </div>
      </div>

      <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
        {outils.map((t) => {
          const Icon = t.icon;
          return (
            <Link key={t.href} href={t.href} className="group flex items-start gap-3 rounded-[12px] border border-border bg-surface-2 p-3.5 transition hover:border-border-2 hover:bg-[color-mix(in_srgb,var(--ink)_3%,var(--surface-2))]">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg" style={{ background: "color-mix(in srgb,var(--accent) 14%,transparent)" }}><Icon className="h-4 w-4 text-accent" /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-[0.88rem] font-semibold">{t.label}</span>
                <span className="mt-0.5 block text-[0.72rem] leading-snug text-faint">{t.desc}</span>
              </span>
              <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-faint transition group-hover:translate-x-0.5" />
            </Link>
          );
        })}
      </div>
    </div>
  );
}
