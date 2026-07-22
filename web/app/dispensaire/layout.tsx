import { getNotifCount } from "@/lib/dispensaire-notifications";
import { getRoleDispensaire } from "@/lib/dispensaire-roles";
import { isStandalone } from "@/lib/standalone-server";
import { DispensaireShell } from "@/components/dispensaire-shell";

// Section dédiée « Dispensaire de Saint-Denis » — sa propre coquille (distincte
// de la partie Iron Wolf). La visibilité des onglets suit le RÔLE du membre au
// sein du dispensaire (système propre, indépendant de l'auth Iron Wolf).
export const dynamic = "force-dynamic";
export const metadata = { title: "Dispensaire de Saint-Denis" };

export default async function DispensaireLayout({ children }: { children: React.ReactNode }) {
  const [role, notifCount, standalone] = await Promise.all([getRoleDispensaire(), getNotifCount(), isStandalone()]);
  const habilite = role.perms.rh || role.perms.factures || role.perms.admin;
  return <DispensaireShell habilite={habilite} estAdmin={role.perms.admin} notifCount={notifCount} standalone={standalone}>{children}</DispensaireShell>;
}
