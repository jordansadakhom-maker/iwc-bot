import Link from "next/link";
import { Bell, MailOpen, Activity } from "lucide-react";
import { getNotificationsFeed, getSessionDiscordId, getAcces } from "@/lib/queries";
import { listerNotifications } from "./actions";
import { NotificationCenter } from "@/components/notification-center";
import { compteNonLus } from "@/lib/notifications-centre";
import { rolesDeActeur } from "@/lib/notif-ciblage";
import { PageHeader, Card, CardHeader, Empty } from "@/components/ui";
import { PlaqueBand } from "@/components/registre-ui";

export const dynamic = "force-dynamic";

const dateFR = (s: string | null) => {
  if (!s) return "";
  try { return new Date(s).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }); } catch { return ""; }
};
const TONE_TXT: Record<string, string> = { accent: "var(--accent)", good: "var(--good)", warn: "var(--warn)", oxblood: "var(--oxblood)", muted: "var(--faint)" };

export default async function NotificationsPage() {
  const [{ connecte, notifs }, feed, monId, acces] = await Promise.all([listerNotifications(), getNotificationsFeed(), getSessionDiscordId(), getAcces()]);
  const nonLus = compteNonLus(notifs);
  const cible = { did: monId, roles: rolesDeActeur(acces) };
  const band = [
    { icon: Bell, label: "Notifications", val: String(notifs.length), sous: "au centre" },
    { icon: MailOpen, label: "Non lues", val: String(nonLus), sous: "à consulter" },
    { icon: Activity, label: "Activité récente", val: String(feed.items.length), sous: "au fil de l'eau" },
  ];

  return (
    <>
      <PageHeader titre="Notifications" sous="Registre des dépêches — télégrammes, messages, rendez-vous & activité" actif={connecte || feed.connecte} />
      {(notifs.length + feed.items.length) > 0 ? <PlaqueBand items={band} cols={3} /> : null}

      {/* Centre de notifications — persistant, lu/non-lu, archivage, filtres, historique. */}
      <Card>
        <CardHeader titre="Centre de notifications" compteur={nonLus} />
        <NotificationCenter initial={notifs} cible={cible} />
      </Card>

      {/* Activité récente (vue dérivée, conservée pour continuité). */}
      <Card>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2.5">
          <h3 className="text-[0.8rem] font-semibold uppercase tracking-[0.06em] text-muted">Activité récente</h3>
          <span className="font-num text-[0.8rem] text-faint">{feed.items.length}</span>
        </div>
        {feed.items.length === 0 ? (
          <Empty icon={Bell}>Aucune activité récente. Les télégrammes, demandes de rendez-vous, factures et opérations terminées s&apos;affichent ici au fil de l&apos;eau.</Empty>
        ) : (
          <div className="flex flex-col divide-y divide-border">
            {feed.items.map((n) => (
              <Link key={n.id} href={n.lien} className="flex items-start gap-3 py-3 transition hover:bg-[color-mix(in_srgb,var(--ink)_3%,transparent)]">
                <span className="mt-0.5 text-[1.05rem]">{n.icon}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[0.88rem] font-medium">{n.titre}</div>
                  <div className="mt-0.5 truncate text-[0.8rem] text-muted">{n.detail}</div>
                </div>
                <span className="shrink-0 text-[0.7rem] tabular-nums" style={{ color: TONE_TXT[n.tone] || "var(--faint)" }}>{dateFR(n.at)}</span>
              </Link>
            ))}
          </div>
        )}
        <p className="mt-3 border-t border-border pt-3 text-[0.74rem] text-faint">
          Les télégrammes et rendez-vous se traitent depuis <Link href="/communication" className="underline hover:text-ink">Communication</Link> — le site conserve toujours la trace.
        </p>
      </Card>
    </>
  );
}
