import { Dashboard } from "@/components/dashboard";
import { getDashboard, getNotificationsFeed, getAlertes, getSessionDiscordId, getAbsences, getSessionProfile, getAcces, getTresorerieEvolution } from "@/lib/queries";
import { getDemandes } from "@/lib/demandes";
import { getLicencesExpirant } from "@/lib/licences";

// Toujours des données fraîches (le bot pousse les mises à jour en continu).
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const monId = await getSessionDiscordId();
  const [data, feed, alertes, demandes, licences, absences, profil, acces, treso] = await Promise.all([
    getDashboard(), getNotificationsFeed(), getAlertes(), getDemandes(monId),
    getLicencesExpirant(30), getAbsences(), getSessionProfile(), getAcces(), getTresorerieEvolution(),
  ]);
  const presence = { presents: Math.max(0, absences.tous.length - absences.absents.length), absents: absences.absents.length };

  // Tendance des coffres sur ~7 jours (delta actuel − dernier point ≤ J-7), depuis
  // la trajectoire de trésorerie déjà reconstruite. Null si pas assez d'historique.
  const pts = treso.points;
  let tendances: { commun: number; legal: number; illegal: number } | null = null;
  if (pts.length >= 2) {
    const cutoff = pts[pts.length - 1].t - 7 * 86400000;
    const passe = [...pts].reverse().find((p) => p.t <= cutoff) || pts[0];
    const cur = pts[pts.length - 1];
    tendances = { commun: cur.commun - passe.commun, legal: cur.legal - passe.legal, illegal: cur.illegal - passe.illegal };
  }

  return (
    <Dashboard
      data={data}
      feed={feed.items}
      alertes={alertes}
      demandes={demandes}
      monId={monId}
      licencesExpirant={licences.items}
      presence={presence}
      profil={profil ? { nom: profil.nom, role: profil.role } : null}
      acces={acces}
      tendances={tendances}
    />
  );
}
