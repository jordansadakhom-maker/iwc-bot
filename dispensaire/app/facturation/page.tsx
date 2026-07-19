import { Coquille } from "@/components/coquille";
import { Facturation } from "@/components/facturation";
import { getSherifs, dbPrete } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function Page() {
  const pret = dbPrete();
  const sherifs = pret ? await getSherifs() : [];
  return (
    <Coquille actif="/facturation" pret={pret}>
      <Facturation sherifs={sherifs} />
    </Coquille>
  );
}
