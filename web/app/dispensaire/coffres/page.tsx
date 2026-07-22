import { getCoffres } from "@/lib/dispensaire-matieres";
import { DispensaireCoffres } from "@/components/dispensaire-coffres";

export const dynamic = "force-dynamic";

export default async function DispensaireCoffresPage() {
  const data = await getCoffres();
  return <DispensaireCoffres data={data} />;
}
