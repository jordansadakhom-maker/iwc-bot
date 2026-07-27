import { getPrisesEnCharge } from "@/lib/dispensaire-prises-en-charge";
import { DispensairePrisesEnCharge } from "@/components/dispensaire-prises-en-charge";

export const dynamic = "force-dynamic";

export default async function DispensairePrisesEnChargePage() {
  const data = await getPrisesEnCharge();
  return <DispensairePrisesEnCharge data={data} />;
}
