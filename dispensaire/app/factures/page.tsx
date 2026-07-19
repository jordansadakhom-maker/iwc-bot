import { Coquille } from "@/components/coquille";
import { Factures } from "@/components/factures";
import { dbPrete } from "@/lib/data";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <Coquille actif="/factures" pret={dbPrete()}>
      <Factures />
    </Coquille>
  );
}
