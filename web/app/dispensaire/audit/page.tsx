import { getAuditDispensaire } from "@/lib/dispensaire-audit";
import { peutAdministrer } from "@/lib/dispensaire-roles";
import { AuditView } from "@/components/audit-view";
import { AccesDirection } from "@/components/dispensaire-acces-direction";

export const dynamic = "force-dynamic";

export default async function DispensaireAuditPage() {
  if (!(await peutAdministrer())) return <AccesDirection sous="Le mode audit est réservé à la direction du dispensaire." />;
  const data = await getAuditDispensaire();
  return <AuditView data={data} cle="audit-dispensaire-checklist" />;
}
