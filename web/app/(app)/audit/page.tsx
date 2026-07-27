import { redirect } from "next/navigation";
import { getAcces } from "@/lib/queries";
import { getAuditIwc } from "@/lib/iwc-audit";
import { PageHeader, Card } from "@/components/ui";
import { AuditView } from "@/components/audit-view";

export const dynamic = "force-dynamic";

export default async function AuditPage() {
  // Réservé à la Direction — les Server Actions et pages sensibles se gardent
  // côté serveur ; un accès direct par URL sans droit est renvoyé au tableau de bord.
  if (!(await getAcces()).direction) redirect("/dashboard");
  const data = await getAuditIwc();
  return (
    <>
      <PageHeader titre="Mode Audit" sous="Contrôle qualité — anomalies, cohérence des données et checklist de tests" />
      <Card><AuditView data={data} cle="audit-iwc-checklist" /></Card>
    </>
  );
}
