import { Coquille } from "@/components/coquille";
import { Ventes } from "@/components/ventes";
import { getVentesSemaine, dbPrete } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function Page() {
  const pret = dbPrete();
  const ventes = pret ? await getVentesSemaine() : [];
  return (
    <Coquille actif="/ventes" pret={pret}>
      <Ventes ventes={ventes} />
    </Coquille>
  );
}
