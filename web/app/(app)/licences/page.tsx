import { ScrollText, BadgeCheck, Layers } from "lucide-react";
import { getLicences, getLicenceConfig, getRoleLicence, getLicenceMembres } from "@/lib/licences";
import { PageHeader, Card } from "@/components/ui";
import { PlaqueBand } from "@/components/registre-ui";
import { LicencesRegistre } from "@/components/licences";

export const dynamic = "force-dynamic";

export default async function LicencesPage() {
  const [data, config, role, membres] = await Promise.all([getLicences(), getLicenceConfig(), getRoleLicence(), getLicenceMembres()]);
  const actives = data.licences.filter((l) => l.statut === "active").length;
  const band = [
    { icon: ScrollText, label: "Licences", val: String(data.licences.length), sous: "au registre" },
    { icon: BadgeCheck, label: "Actives", val: String(actives), sous: "en cours de validité" },
    { icon: Layers, label: "Types", val: String(data.types.length), sous: "d'autorisations" },
  ];
  return (
    <>
      <PageHeader titre="Licences & autorisations" sous="Registre officiel — délivrance, validité, restrictions et vérification rapide" actif={data.pret} />
      {data.pret ? <PlaqueBand items={band} cols={3} /> : null}
      <Card><LicencesRegistre data={data} config={config} caps={role.caps} roleLabel={role.role} membres={membres.membres} /></Card>
    </>
  );
}
