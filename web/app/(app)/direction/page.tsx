import { PageHeader } from "@/components/ui";
import { AccesReserve } from "@/components/acces-reserve";
import { CockpitDirection } from "@/components/cockpit-direction";
import { getAcces } from "@/lib/queries";
import { getCockpit } from "@/lib/cockpit-data";

export const dynamic = "force-dynamic";

export default async function DirectionPage() {
  const acces = await getAcces();
  if (!acces.direction) return <AccesReserve titre="Mode Direction" detail="Le cockpit de pilotage est réservé à la Direction de la compagnie." />;

  const data = await getCockpit();
  return (
    <>
      <PageHeader titre="Mode Direction" sous="Cockpit de pilotage — vue consolidée en temps réel" actif={data.connecte} />
      <CockpitDirection data={data} />
    </>
  );
}
