import { Dashboard } from "@/components/dashboard";
import { getDashboard, getNotificationsFeed, getAlertes } from "@/lib/queries";

// Toujours des données fraîches (le bot pousse les mises à jour en continu).
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [data, feed, alertes] = await Promise.all([getDashboard(), getNotificationsFeed(), getAlertes()]);
  return <Dashboard data={data} feed={feed.items} alertes={alertes} />;
}
