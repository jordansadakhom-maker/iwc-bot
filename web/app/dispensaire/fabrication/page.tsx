import { getFabrication } from "@/lib/dispensaire-fabrication";
import { DispensaireFabrication } from "@/components/dispensaire-fabrication";

export const dynamic = "force-dynamic";

export default async function DispensaireFabricationPage() {
  const data = await getFabrication();
  return <DispensaireFabrication data={data} />;
}
