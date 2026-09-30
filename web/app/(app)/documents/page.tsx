import { FileText } from "lucide-react";
import { GenerateurDocuments } from "@/components/generateur-documents";
import { PageHeader, SectionTitle } from "@/components/ui";
import { getOperations } from "@/lib/queries";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // lecture IA d'images (peut dépasser 10 s) — compatible forfait gratuit
export const metadata = { title: "Documents — Iron Wolf Company" };

export default async function Page() {
  const ops = await getOperations();
  // Opérations rapportables : terminées d'abord, puis en cours.
  const operations = [...ops.operations.terminees, ...ops.operations.encours].map((o) => ({ id: o.id, titre: o.titre, lieu: o.lieu }));
  return (
    <>
      <PageHeader titre="Documents" sous="Rédige un document officiel en un clic — l'IA écrit dans le ton, tu relis, tu imprimes." actif={ops.connecte} pole={ops.pole} />
      <SectionTitle tone="var(--accent)" icon={FileText}>Générateur de documents</SectionTitle>
      <GenerateurDocuments operations={operations} />
    </>
  );
}
