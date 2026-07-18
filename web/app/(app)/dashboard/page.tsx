import { Dashboard } from "@/components/dashboard";
import { getDashboard } from "@/lib/queries";

// Toujours des données fraîches (le bot pousse les mises à jour en continu).
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const data = await getDashboard();
  return <Dashboard data={data} />;
}
