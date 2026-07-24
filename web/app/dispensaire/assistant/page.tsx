import { getAssistantDispensaire } from "@/lib/dispensaire-assistant";
import { AssistantPanel } from "@/components/erp-assistant";

export const dynamic = "force-dynamic";

export default async function DispensaireAssistantPage() {
  const veille = await getAssistantDispensaire();
  return <AssistantPanel data={veille} />;
}
