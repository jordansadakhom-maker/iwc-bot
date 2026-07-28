import { Dashboard } from "@/components/dashboard";
import { getDashboard, getNotificationsFeed, getAlertes, getSessionDiscordId } from "@/lib/queries";
import { getDemandes } from "@/lib/demandes";

// Toujours des données fraîches (le bot pousse les mises à jour en continu).
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const monId = await getSessionDiscordId();
  const [data, feed, alertes, demandes] = await Promise.all([getDashboard(), getNotificationsFeed(), getAlertes(), getDemandes(monId)]);
  return <Dashboard data={data} feed={feed.items} alertes={alertes} demandes={demandes} monId={monId} />;
}
