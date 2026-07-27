import { getAuditDispensaire } from "@/lib/dispensaire-audit";
import { AuditView } from "@/components/audit-view";

export const dynamic = "force-dynamic";

export default async function DispensaireAuditPage() {
  const data = await getAuditDispensaire();
  return <AuditView data={data} cle="audit-dispensaire-checklist" />;
}
