import { Coquille } from "@/components/coquille";
import { Documents } from "@/components/documents";
import { getDocuments, dbPrete } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function Page() {
  const pret = dbPrete();
  const docs = pret ? await getDocuments() : [];
  return (
    <Coquille actif="/documents" pret={pret}>
      <Documents docs={docs} />
    </Coquille>
  );
}
