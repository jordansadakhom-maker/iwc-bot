import { getSalaires } from "@/lib/dispensaire-salaires";
import { peutAdministrer } from "@/lib/dispensaire-roles";
import { DispensaireSalaires } from "@/components/dispensaire-salaires";
import { AccesDirection } from "@/components/dispensaire-acces-direction";

export const dynamic = "force-dynamic";

export default async function DispensaireSalairesPage() {
  if (!(await peutAdministrer())) return <AccesDirection sous="Le calcul des salaires est réservé à la direction du dispensaire." />;
  const data = await getSalaires();
  return <DispensaireSalaires data={data} />;
}
