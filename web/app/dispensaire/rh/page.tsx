import { getRh } from "@/lib/dispensaire-rh";
import { DispensaireRh } from "@/components/dispensaire-rh";

export const dynamic = "force-dynamic";

export default async function DispensaireRhPage() {
  const data = await getRh();
  return <DispensaireRh data={data} />;
}
