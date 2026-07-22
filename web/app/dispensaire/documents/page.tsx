import { getDocuments } from "@/lib/dispensaire-docs";
import { DispensaireDocuments } from "@/components/dispensaire-documents";

export const dynamic = "force-dynamic";

export default async function DispensaireDocumentsPage() {
  const data = await getDocuments();
  return <DispensaireDocuments data={data} />;
}
