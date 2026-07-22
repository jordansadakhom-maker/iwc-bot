import { getAcces } from "@/lib/queries";
import { getNotifCount } from "@/lib/dispensaire-notifications";
import { DispensaireShell } from "@/components/dispensaire-shell";

// Section dédiée « Dispensaire de Saint-Denis » — sa propre coquille (distincte
// de la partie Iron Wolf). Les onglets restreints (RH, Factures) n'apparaissent
// qu'aux membres habilités.
export const dynamic = "force-dynamic";

export default async function DispensaireLayout({ children }: { children: React.ReactNode }) {
  const [acces, notifCount] = await Promise.all([getAcces(), getNotifCount()]);
  return <DispensaireShell habilite={acces.peutMedical} notifCount={notifCount}>{children}</DispensaireShell>;
}
