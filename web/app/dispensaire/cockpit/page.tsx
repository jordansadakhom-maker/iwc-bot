import { getCockpit } from "@/lib/dispensaire-cockpit";
import { DispensaireCockpit } from "@/components/dispensaire-cockpit";

export const dynamic = "force-dynamic";

export default async function DispensaireCockpitPage() {
  const data = await getCockpit();
  return <DispensaireCockpit data={data} />;
}
