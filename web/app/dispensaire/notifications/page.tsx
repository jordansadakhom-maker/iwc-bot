import { getNotifications, getActiviteRecente } from "@/lib/dispensaire-notifications";
import { DispensaireNotifications } from "@/components/dispensaire-notifications";

export const dynamic = "force-dynamic";

export default async function DispensaireNotificationsPage() {
  const [{ items }, activite] = await Promise.all([getNotifications(), getActiviteRecente()]);
  return <DispensaireNotifications items={items} activite={activite} />;
}
