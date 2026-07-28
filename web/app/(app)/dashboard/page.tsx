import { Dashboard } from "@/components/dashboard";
import { getDashboard, getNotificationsFeed, getAlertes, getSessionDiscordId, getAbsences } from "@/lib/queries";
import { getDemandes } from "@/lib/demandes";
import { getLicencesExpirant } from "@/lib/licences";

// Toujours des données fraîches (le bot pousse les mises à jour en continu).
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const monId = await getSessionDiscordId();
  const [data, feed, alertes, demandes, licences, absences] = await Promise.all([
    getDashboard(), getNotificationsFeed(), getAlertes(), getDemandes(monId),
    getLicencesExpirant(30), getAbsences(),
  ]);
  const presence = { presents: Math.max(0, absences.tous.length - absences.absents.length), absents: absences.absents.length };
  return <Dashboard data={data} feed={feed.items} alertes={alertes} demandes={demandes} monId={monId} licencesExpirant={licences.items} presence={presence} />;
}
