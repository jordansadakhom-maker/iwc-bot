import { getSalaires } from "@/lib/dispensaire-salaires";
import { peutAdministrer } from "@/lib/dispensaire-roles";
import { DispensaireSalaires } from "@/components/dispensaire-salaires";
import { AccesDirection } from "@/components/dispensaire-acces-direction";

export const dynamic = "force-dynamic";

export default async function DispensaireSalairesPage({ searchParams }: { searchParams: Promise<{ semaine?: string }> }) {
  if (!(await peutAdministrer())) return <AccesDirection sous="Le calcul des salaires est réservé à la direction du dispensaire." />;
  const sp = await searchParams;
  const data = await getSalaires(sp?.semaine);
  return <DispensaireSalaires data={data} />;
}
