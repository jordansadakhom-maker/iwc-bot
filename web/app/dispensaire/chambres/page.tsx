import { getChambres } from "@/lib/dispensaire-chambres";
import { DispensaireChambres } from "@/components/dispensaire-chambres";

export const dynamic = "force-dynamic";

export default async function DispensaireChambresPage() {
  const data = await getChambres();
  return <DispensaireChambres data={data} />;
}
