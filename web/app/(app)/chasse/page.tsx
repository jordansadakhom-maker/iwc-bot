import { Boxes, Map, AlertTriangle, Store } from "lucide-react";
import { getChasse } from "@/lib/chasse";
import { getMarchesChasse } from "@/lib/marches-chasse";
import { PageHeader, Card } from "@/components/ui";
import { PlaqueBand } from "@/components/registre-ui";
import { ChasseTabs } from "@/components/chasse-tabs";

export const dynamic = "force-dynamic";

export default async function ChassePage() {
  const [data, marches] = await Promise.all([getChasse(), getMarchesChasse()]);

  const unites = data.stock.reduce((a, s) => a + (Number(s.quantite) || 0), 0);
  const sousSeuil = data.stock.filter((s) => s.seuil != null && s.quantite <= s.seuil).length;
  const villesActives = (marches.villes || []).filter((v) => v.actif).length;
  const band = [
    { icon: Boxes, label: "Ressources", val: String(unites), sous: `${data.stock.length} article(s)` },
    { icon: Map, label: "Zones", val: String(data.zones.length), sous: "de chasse" },
    { icon: AlertTriangle, label: "Sous le seuil", val: String(sousSeuil), sous: "à réapprovisionner" },
    { icon: Store, label: "Marchés", val: String(villesActives), sous: `${(marches.ressources || []).length} ressource(s)` },
  ];

  return (
    <>
      <PageHeader titre="Chasse" sous="Charrettes &amp; ressources — stock, prix de rachat &amp; marchés" actif={data.connecte} pole={data.pole} />
      {data.pret ? <PlaqueBand items={band} cols={4} /> : null}
      <Card>
        <ChasseTabs stock={data} marches={marches} />
      </Card>
    </>
  );
}
