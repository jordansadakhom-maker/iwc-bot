import Link from "next/link";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { getAcces } from "@/lib/queries";
import { getEnService } from "@/lib/dispensaire-pointage";
import { DISP_NAV } from "@/lib/dispensaire-nav";
import { DispEnService } from "@/components/dispensaire-en-service";

export const dynamic = "force-dynamic";

export default async function DispensaireAccueil() {
  const acces = await getAcces();
  const habilite = acces.peutMedical;
  const enService = await getEnService();
  const modules = DISP_NAV.filter((t) => t.href !== "/dispensaire" && (!t.restreint || habilite));

  return (
    <div className="flex flex-col gap-5">
      <p className="max-w-2xl font-display text-[1rem] italic text-muted">Bienvenue au registre du Dispensaire. Tout ce qui se passe ici — soins, stocks, personnel, factures — se tient à jour d&apos;un même endroit.</p>

      {/* Encarts d'accueil (activés par les prochains modules) */}
      <div className="grid gap-3 md:grid-cols-2">
        <div className="flex items-center gap-3 rounded-[14px] border border-border bg-surface-2 p-4">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full" style={{ background: "color-mix(in srgb,var(--warn) 16%,transparent)" }}><AlertTriangle className="h-5 w-5" style={{ color: "var(--warn)" }} /></span>
          <div><div className="text-[0.88rem] font-semibold">Stocks en alerte</div><div className="text-[0.76rem] text-faint">Apparaîtra ici dès le module <b>Stockage</b> (seuils à fixer).</div></div>
        </div>
        <DispEnService sessions={enService} />
      </div>

      {/* Accès aux modules */}
      <div>
        <div className="mb-2 text-[0.72rem] font-semibold uppercase tracking-[0.06em] text-faint">Modules du dispensaire</div>
        <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
          {modules.map((t) => {
            const Icon = t.icon;
            const inner = (
              <>
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg" style={{ background: "color-mix(in srgb,var(--accent) 14%,transparent)" }}><Icon className="h-4 w-4 text-accent" /></span>
                <span className="min-w-0 flex-1"><span className="block text-[0.86rem] font-semibold">{t.label}</span>{!t.pret ? <span className="text-[0.68rem] text-faint">Bientôt disponible</span> : <span className="text-[0.68rem] text-faint">Ouvrir</span>}</span>
                {t.pret ? <ArrowRight className="h-4 w-4 text-faint" /> : <span className="rounded-full border border-border px-1.5 text-[0.58rem] uppercase text-faint">bientôt</span>}
              </>
            );
            return t.pret
              ? <Link key={t.href} href={t.href} className="flex items-center gap-3 rounded-[12px] border border-border bg-surface-2 p-3 transition hover:border-border-2 hover:bg-[color-mix(in_srgb,var(--ink)_3%,var(--surface-2))]">{inner}</Link>
              : <div key={t.href} className="flex cursor-not-allowed items-center gap-3 rounded-[12px] border border-border bg-surface-2 p-3 opacity-60">{inner}</div>;
          })}
        </div>
      </div>
    </div>
  );
}
