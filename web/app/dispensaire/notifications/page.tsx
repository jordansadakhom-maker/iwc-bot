import { getNotifications } from "@/lib/dispensaire-notifications";
import { DispensaireNotifications } from "@/components/dispensaire-notifications";

export const dynamic = "force-dynamic";

export default async function DispensaireNotificationsPage() {
  const { items } = await getNotifications();
  return <DispensaireNotifications items={items} />;
}
