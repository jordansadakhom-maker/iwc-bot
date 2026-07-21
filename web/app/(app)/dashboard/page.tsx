import { Dashboard } from "@/components/dashboard";
import { getDashboard, getNotificationsFeed } from "@/lib/queries";

// Toujours des données fraîches (le bot pousse les mises à jour en continu).
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [data, feed] = await Promise.all([getDashboard(), getNotificationsFeed()]);
  return <Dashboard data={data} feed={feed.items} />;
}
