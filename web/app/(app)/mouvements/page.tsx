import { History, ArrowDownRight, ArrowUpRight } from "lucide-react";
import { getAuditIWC } from "@/lib/audit-iwc";
import { getPole } from "@/lib/queries";
import { PageHeader, Card } from "@/components/ui";
import { PlaqueBand } from "@/components/registre-ui";
import { AuditIWC } from "@/components/audit-iwc";

export const dynamic = "force-dynamic";

export default async function MouvementsPage() {
  const [{ items, pret }, pole] = await Promise.all([getAuditIWC(), getPole()]);
  const band = [
    { icon: History, label: "Mouvements", val: String(items.length), sous: "tracés" },
    { icon: ArrowDownRight, label: "Entrées", val: String(items.filter((i) => i.couleur === "ajout").length), sous: "ajouts / dépôts" },
    { icon: ArrowUpRight, label: "Sorties", val: String(items.filter((i) => i.couleur === "retrait").length), sous: "retraits" },
  ];

  return (
    <>
      <PageHeader
        titre="Mouvements & audit"
        sous="Historique complet des mouvements de coffres &amp; stocks — Chasse, Armurerie &amp; coffre commun"
        actif={pret}
        pole={pole}
      />
      {pret ? <PlaqueBand items={band} cols={3} /> : null}
      <Card>
        <AuditIWC items={items} pret={pret} />
      </Card>
    </>
  );
}
