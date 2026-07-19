import Link from "next/link";
import { Bell } from "lucide-react";
import { getNotificationsFeed } from "@/lib/queries";
import { PageHeader, Card, CardHeader, Empty, Badge } from "@/components/ui";

export const dynamic = "force-dynamic";

const dateFR = (s: string | null) => {
  if (!s) return "";
  try { return new Date(s).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }); } catch { return ""; }
};
const TONE_TXT: Record<string, string> = { accent: "var(--accent)", good: "var(--good)", warn: "var(--warn)", oxblood: "var(--oxblood)", muted: "var(--faint)" };

export default async function NotificationsPage() {
  const { connecte, items } = await getNotificationsFeed();
  const tg = items.filter((i) => i.type.startsWith("telegramme")).length;
  const rdv = items.filter((i) => i.type === "rdv").length;

  return (
    <>
      <PageHeader titre="Notifications" sous="Télégrammes, messages, rendez-vous & activité de la maison" actif={connecte} />
      <Card>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5">
            <h3 className="text-[0.8rem] font-semibold uppercase tracking-[0.06em] text-muted">Centre de notifications</h3>
            <span className="font-num text-[0.8rem] text-faint">{items.length}</span>
          </div>
          <div className="flex items-center gap-2 text-[0.72rem] text-faint">
            {tg ? <span>✉️ {tg} télégramme(s)</span> : null}
            {rdv ? <span>📅 {rdv} RDV</span> : null}
          </div>
        </div>

        {items.length === 0 ? (
          <Empty icon={Bell}>
            Aucune notification pour l&apos;instant. Les télégrammes, les demandes de rendez-vous, les factures et les opérations terminées s&apos;afficheront ici au fil de l&apos;eau.
          </Empty>
        ) : (
          <div className="flex flex-col divide-y divide-border">
            {items.map((n) => (
              <Link key={n.id} href={n.lien} className="flex items-start gap-3 py-3 transition hover:bg-[color-mix(in_srgb,var(--ink)_3%,transparent)]">
                <span className="mt-0.5 text-[1.05rem]">{n.icon}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[0.88rem] font-medium">{n.titre}</span>
                    {n.type === "telegramme" ? <Badge tone="warn">à répondre</Badge> : null}
                  </div>
                  <div className="mt-0.5 truncate text-[0.8rem] text-muted">{n.detail}</div>
                </div>
                <span className="shrink-0 text-[0.7rem] tabular-nums" style={{ color: TONE_TXT[n.tone] || "var(--faint)" }}>{dateFR(n.at)}</span>
              </Link>
            ))}
          </div>
        )}
        <p className="mt-3 border-t border-border pt-3 text-[0.74rem] text-faint">
          Les télégrammes se répondent depuis <Link href="/communication" className="underline hover:text-ink">Communication</Link> — le client reçoit ta réponse en message privé et la trace est conservée.
        </p>
      </Card>
    </>
  );
}
