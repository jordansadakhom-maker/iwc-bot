import { Suspense } from "react";
import { getCockpit } from "@/lib/dispensaire-cockpit";
import { DispensaireCockpit } from "@/components/dispensaire-cockpit";

export const dynamic = "force-dynamic";

// Contenu réel du cockpit — isolé dans un composant serveur asynchrone pour être
// STREAMÉ : la coquille de la page part immédiatement, ce bloc arrive dès que
// l'agrégat (8 sources en parallèle) est prêt.
async function CockpitContenu() {
  const data = await getCockpit();
  return <DispensaireCockpit data={data} />;
}

// Squelette calqué sur la disposition réelle du cockpit (bandeau + KPI + blocs),
// affiché instantanément le temps que les données arrivent.
function CockpitSquelette() {
  const Bloc = ({ h = 150 }: { h?: number }) => <div className="animate-pulse rounded-[14px] border border-border bg-surface" style={{ height: h }} />;
  return (
    <div className="flex flex-col gap-4">
      <div className="h-6 w-64 animate-pulse rounded bg-surface-2" />
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4 xl:grid-cols-7">
        {Array.from({ length: 7 }).map((_, i) => <div key={i} className="h-[74px] animate-pulse rounded-[14px] border border-border bg-surface" />)}
      </div>
      <div className="grid gap-4 lg:grid-cols-2"><Bloc /><Bloc /><Bloc /><Bloc /></div>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-[74px] animate-pulse rounded-[14px] border border-border bg-surface" />)}
      </div>
      <div className="flex items-center gap-2 text-[0.8rem] text-faint">
        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-border-2 border-t-accent" /> Agrégation du cockpit…
      </div>
    </div>
  );
}

export default function DispensaireCockpitPage() {
  return (
    <Suspense fallback={<CockpitSquelette />}>
      <CockpitContenu />
    </Suspense>
  );
}
