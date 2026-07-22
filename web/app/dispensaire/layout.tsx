import { getNotifCount } from "@/lib/dispensaire-notifications";
import { getRoleDispensaire } from "@/lib/dispensaire-roles";
import { isStandalone } from "@/lib/standalone-server";
import { DispensaireShell } from "@/components/dispensaire-shell";

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

export default async function DispensaireLayout({ children }: { children: React.ReactNode }) {
  const [role, notifCount, standalone] = await Promise.all([getRoleDispensaire(), getNotifCount(), isStandalone()]);
  const habilite = role.perms.rh || role.perms.factures || role.perms.admin;
  // Dateline d'ambiance : jour réel, mais millésime figé à 1904 (la fiction du
  // registre). Calculée côté serveur pour éviter tout décalage d'hydratation.
  const jour = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", day: "numeric", month: "long" }).format(new Date());
  const dateline = `le ${jour} · 1904`;
  return <DispensaireShell habilite={habilite} estAdmin={role.perms.admin} notifCount={notifCount} standalone={standalone} dateline={dateline}>{children}</DispensaireShell>;
}
