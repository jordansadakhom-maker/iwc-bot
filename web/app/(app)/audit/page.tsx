import { redirect } from "next/navigation";
import { ClipboardCheck, AlertTriangle, Layers } from "lucide-react";
import { getAcces } from "@/lib/queries";
import { getAuditQualite } from "@/lib/audit-qualite";
import { PageHeader, Card } from "@/components/ui";
import { PlaqueBand } from "@/components/registre-ui";
import { AuditView } from "@/components/audit-view";

export const dynamic = "force-dynamic";

export default async function AuditPage() {
  // Réservé à la Direction — les Server Actions et pages sensibles se gardent
  // côté serveur ; un accès direct par URL sans droit est renvoyé au tableau de bord.
  if (!(await getAcces()).direction) redirect("/dashboard");
  const data = await getAuditQualite();
  const band = [
    { icon: ClipboardCheck, label: "Contrôles", val: String(data.totalControles), sous: "effectués" },
    { icon: AlertTriangle, label: "Anomalies", val: String(data.anomalies.length), sous: "détectées" },
    { icon: Layers, label: "Domaines", val: String(data.categories.length), sous: "audités" },
  ];
  return (
    <>
      <PageHeader titre="Mode Audit" sous="Contrôle qualité — anomalies, cohérence des données et checklist de tests" />
      <PlaqueBand items={band} cols={3} />
      <Card><AuditView data={data} cle="audit-iwc-checklist" /></Card>
    </>
  );
}
