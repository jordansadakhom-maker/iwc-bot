import { getChambres } from "@/lib/dispensaire-chambres";
import { DispensaireChambres } from "@/components/dispensaire-chambres";
import { DispensairePlanChambres } from "@/components/dispensaire-plan-chambres";

export const dynamic = "force-dynamic";

export default async function DispensaireChambresPage() {
  const data = await getChambres();
  return (
    <div className="flex flex-col gap-4">
      <DispensairePlanChambres chambres={data.chambres} />
      <DispensaireChambres data={data} />
    </div>
  );
}
