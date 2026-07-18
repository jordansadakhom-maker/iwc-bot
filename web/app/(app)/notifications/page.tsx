import { Bell } from "lucide-react";
import { getNotifications } from "@/lib/queries";
import { PageHeader, Card, CardHeader, Empty } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const { connecte, notifs } = await getNotifications();

  return (
    <>
      <PageHeader titre="Notifications" sous="Événements de la maison" actif={connecte} />
      <Card>
        <CardHeader titre="Centre de notifications" compteur={notifs.length} />
        {notifs.length === 0 ? (
          <Empty icon={Bell}>
            Aucune notification pour l&apos;instant. Les événements (validations, RDV, changements de statut…) s&apos;afficheront ici au fil de l&apos;eau.
          </Empty>
        ) : (
          <div className="flex flex-col divide-y divide-border">
            {notifs.map((n) => (
              <div key={n.id} className="flex items-start gap-3 py-3">
                <span className="mt-1.5 h-[7px] w-[7px] shrink-0 rounded-full" style={{ background: n.lu ? "var(--faint)" : "var(--accent)" }} />
                <div className="min-w-0">
                  <div className="text-[0.88rem] font-medium">{n.titre}</div>
                  {n.corps ? <div className="mt-0.5 text-[0.8rem] text-muted">{n.corps}</div> : null}
                  <div className="mt-1 text-[0.7rem] uppercase tracking-[0.05em] text-faint">{n.type}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}
