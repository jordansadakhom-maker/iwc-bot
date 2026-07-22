import { getAcces } from "@/lib/queries";
import { DispensaireShell } from "@/components/dispensaire-shell";

// Section dédiée « Dispensaire de Saint-Denis » — sa propre coquille (distincte
// de la partie Iron Wolf). Les onglets restreints (RH, Factures) n'apparaissent
// qu'aux membres habilités.
export const dynamic = "force-dynamic";

export default async function DispensaireLayout({ children }: { children: React.ReactNode }) {
  const acces = await getAcces();
  return <DispensaireShell habilite={acces.peutMedical}>{children}</DispensaireShell>;
}
