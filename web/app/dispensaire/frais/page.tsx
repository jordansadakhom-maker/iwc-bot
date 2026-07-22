import { getFrais } from "@/lib/dispensaire-facturation";
import { DispensaireFrais } from "@/components/dispensaire-frais";

export const dynamic = "force-dynamic";

export default async function DispensaireFraisPage() {
  const data = await getFrais();
  return <DispensaireFrais data={data} />;
}
