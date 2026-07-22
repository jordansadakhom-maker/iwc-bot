import { getRapports } from "@/lib/dispensaire-docs";
import { DispensaireRapports } from "@/components/dispensaire-rapports";

export const dynamic = "force-dynamic";

export default async function DispensaireRapportsPage() {
  const data = await getRapports();
  return <DispensaireRapports data={data} />;
}
