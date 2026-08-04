import { getCharrettes } from "@/lib/dispensaire-charrettes";
import { DispensaireCharrettes } from "@/components/dispensaire-charrettes";

export const dynamic = "force-dynamic";

export default async function DispensaireCharrettesPage() {
  const data = await getCharrettes();
  return <DispensaireCharrettes data={data} />;
}
