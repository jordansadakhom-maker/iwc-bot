import { getNotifCount } from "@/lib/dispensaire-notifications";
import { getRoleDispensaire } from "@/lib/dispensaire-roles";
import { DispensaireShell } from "@/components/dispensaire-shell";

// Section dédiée « Dispensaire de Saint-Denis » — sa propre coquille (distincte
// de la partie Iron Wolf). La visibilité des onglets suit le RÔLE du membre au
// sein du dispensaire (système propre, indépendant de l'auth Iron Wolf).
export const dynamic = "force-dynamic";

export default async function DispensaireLayout({ children }: { children: React.ReactNode }) {
  const [role, notifCount] = await Promise.all([getRoleDispensaire(), getNotifCount()]);
  const habilite = role.perms.rh || role.perms.factures || role.perms.admin;
  return <DispensaireShell habilite={habilite} estAdmin={role.perms.admin} notifCount={notifCount}>{children}</DispensaireShell>;
}
