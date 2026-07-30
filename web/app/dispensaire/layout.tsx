import { getNotifCount } from "@/lib/dispensaire-notifications";
import { getRoleDispensaire, getConfig } from "@/lib/dispensaire-roles";
import { getMonServiceOuvert } from "@/lib/dispensaire-pointage";
import { isStandalone } from "@/lib/standalone-server";
import { DispensaireShell } from "@/components/dispensaire-shell";
import { DispensaireAccesReserve } from "@/components/dispensaire-acces-reserve";
import { DispensaireKeepalive } from "@/components/dispensaire-keepalive";
import { RepriseService } from "@/components/dispensaire-reprise-service";
import { DispensaireAccesTracker } from "@/components/dispensaire-acces-tracker";

// Section dédiée « Dispensaire de Saint-Denis » — sa propre coquille (distincte
// de la partie Iron Wolf). La visibilité des onglets suit le RÔLE du membre au
// sein du dispensaire (système propre, indépendant de l'auth Iron Wolf).
export const dynamic = "force-dynamic";
const DESC = "Gestion du Dispensaire de Saint-Denis — pointage, personnel, stocks, soins et facturation, réunis d'un même endroit.";
export const metadata = {
  title: "Dispensaire de Saint-Denis",
  description: DESC,
  openGraph: { title: "Dispensaire de Saint-Denis", description: DESC },
  twitter: { title: "Dispensaire de Saint-Denis", description: DESC },
};

// ⚠️ DIAGNOSTIC TEMPORAIRE — à retirer une fois le bug identifié.
function DiagBox({ where, e }: { where: string; e: unknown }) {
  const err = e as { message?: string; stack?: string };
  return (
    <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", padding: 16, margin: 12, border: "2px solid #e5484d", borderRadius: 10, background: "#1a1113", color: "#ffd7d7", fontSize: 12, lineHeight: 1.5 }}>
      {`🔧 DIAGNOSTIC (temporaire) — ${where}\n\nMESSAGE: ${err?.message ?? String(e)}\n\nSTACK:\n${err?.stack ?? "(pas de stack disponible)"}`}
    </pre>
  );
}

export default async function DispensaireLayout({ children }: { children: React.ReactNode }) {
  try {
    const role = await getRoleDispensaire();
    // Liste blanche stricte (site autonome) : un compte non autorisé n'affiche
    // NI la coquille NI les pages — juste l'écran « Accès réservé ».
    if (!role.autorise) return <DispensaireAccesReserve nom={role.nom} identifiant={role.identifiant} />;

    const [notifCount, standalone, monService, cfg] = await Promise.all([getNotifCount(), isStandalone(), getMonServiceOuvert(), getConfig()]);
    // Dateline d'ambiance : jour réel, mais millésime figé à 1904 (la fiction du
    // registre). Calculée côté serveur pour éviter tout décalage d'hydratation.
    const jour = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", day: "numeric", month: "long" }).format(new Date());
    const dateline = `le ${jour} · 1904`;
    return (
      <>
        {/* Service ouvert du compte connecté : heartbeat (détection des oublis) +
            fenêtre de reprise si le service est resté « à confirmer ». */}
        {monService ? <DispensaireKeepalive id={monService.id} /> : null}
        {monService ? <RepriseService id={monService.id} debut={monService.debut} lastSeen={monService.lastSeen} inactiviteMin={cfg.pointageInactiviteMin} /> : null}
        {/* Journalise les accès aux modules sensibles (espace Direction). */}
        <DispensaireAccesTracker />
        <DispensaireShell perms={role.perms} notifCount={notifCount} standalone={standalone} dateline={dateline}>{children}</DispensaireShell>
      </>
    );
  } catch (e) {
    return <DiagBox where="Layout Dispensaire (données globales)" e={e} />;
  }
}
