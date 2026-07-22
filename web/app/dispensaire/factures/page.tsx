import { getFactures } from "@/lib/dispensaire-facturation";
import { DispensaireFactures } from "@/components/dispensaire-factures";

export const dynamic = "force-dynamic";

export default async function DispensaireFacturesPage() {
  const data = await getFactures();
  return <DispensaireFactures data={data} />;
}
