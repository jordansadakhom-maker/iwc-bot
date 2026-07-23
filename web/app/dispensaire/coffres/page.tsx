import { getCoffresInventaire } from "@/lib/dispensaire-stock";
import { DispensaireCoffres } from "@/components/dispensaire-coffres";

export const dynamic = "force-dynamic";

export default async function DispensaireCoffresPage() {
  const data = await getCoffresInventaire();
  return <DispensaireCoffres data={data} />;
}
