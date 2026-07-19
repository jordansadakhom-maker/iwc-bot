import { Coquille } from "@/components/coquille";
import { Stockage } from "@/components/stockage";
import { getStock, getMouvements, dbPrete } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function Page() {
  const pret = dbPrete();
  const [stock, mouvements] = pret ? await Promise.all([getStock(), getMouvements(60)]) : [[], []];
  return (
    <Coquille actif="/stockage" pret={pret}>
      <Stockage stock={stock} mouvements={mouvements} />
    </Coquille>
  );
}
