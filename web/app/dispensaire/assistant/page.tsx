import { getAssistantDispensaire } from "@/lib/dispensaire-assistant";
import { AssistantPanel } from "@/components/erp-assistant";
import { setEtatNotif } from "./actions";

export const dynamic = "force-dynamic";

export default async function DispensaireAssistantPage() {
  const veille = await getAssistantDispensaire();
  return <AssistantPanel data={veille} setEtat={setEtatNotif} />;
}
