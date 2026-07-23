import { getAuditIWC } from "@/lib/audit-iwc";
import { getPole } from "@/lib/queries";
import { PageHeader, Card } from "@/components/ui";
import { AuditIWC } from "@/components/audit-iwc";

export const dynamic = "force-dynamic";

export default async function MouvementsPage() {
  const [{ items, pret }, pole] = await Promise.all([getAuditIWC(), getPole()]);

  return (
    <>
      <PageHeader
        titre="Mouvements & audit"
        sous="Historique complet des mouvements de coffres &amp; stocks — Chasse, Armurerie &amp; coffre commun"
        actif={pret}
        pole={pole}
      />
      <Card>
        <AuditIWC items={items} pret={pret} />
      </Card>
    </>
  );
}
