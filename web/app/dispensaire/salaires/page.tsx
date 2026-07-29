import { getSalaires } from "@/lib/dispensaire-salaires";
import { DispensaireSalaires } from "@/components/dispensaire-salaires";

export const dynamic = "force-dynamic";

export default async function DispensaireSalairesPage() {
  const data = await getSalaires();
  return <DispensaireSalaires data={data} />;
}
