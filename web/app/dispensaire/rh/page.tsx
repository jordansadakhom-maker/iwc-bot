import { getRh } from "@/lib/dispensaire-rh";
import { peutGererRH } from "@/lib/dispensaire-roles";
import { getServicesAValider } from "@/lib/dispensaire-pointage";
import { DispensaireRh } from "@/components/dispensaire-rh";
import { ServicesDirection } from "@/components/dispensaire-services-direction";
import { AccesDirection } from "@/components/dispensaire-acces-direction";

export const dynamic = "force-dynamic";

export default async function DispensaireRhPage() {
  if (!(await peutGererRH())) return <AccesDirection sous="La gestion du personnel (RH) est réservée à l'encadrement et à la direction." />;
  const [data, aValider] = await Promise.all([getRh(), getServicesAValider()]);
  return (
    <div className="flex flex-col gap-4">
      <ServicesDirection services={aValider.services} />
      <DispensaireRh data={data} />
    </div>
  );
}
