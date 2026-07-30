import { getRh } from "@/lib/dispensaire-rh";
import { peutGererRH } from "@/lib/dispensaire-roles";
import { DispensaireRh } from "@/components/dispensaire-rh";
import { AccesDirection } from "@/components/dispensaire-acces-direction";

export const dynamic = "force-dynamic";

export default async function DispensaireRhPage() {
  if (!(await peutGererRH())) return <AccesDirection sous="La gestion du personnel (RH) est réservée à l'encadrement et à la direction." />;
  const data = await getRh();
  return <DispensaireRh data={data} />;
}
