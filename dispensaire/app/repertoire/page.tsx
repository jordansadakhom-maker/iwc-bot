import { Coquille } from "@/components/coquille";
import { Repertoire } from "@/components/repertoire";
import { getRepertoire, dbPrete } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function Page() {
  const pret = dbPrete();
  const entrees = pret ? await getRepertoire() : [];
  return (
    <Coquille actif="/repertoire" pret={pret}>
      <Repertoire entrees={entrees} />
    </Coquille>
  );
}
