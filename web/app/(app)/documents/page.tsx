import { FileText } from "lucide-react";
import { GenerateurDocuments } from "@/components/generateur-documents";
import { SectionTitle } from "@/components/ui";
import { getOperations } from "@/lib/queries";

export const dynamic = "force-dynamic";
export const metadata = { title: "Documents — Iron Wolf Company" };

export default async function Page() {
  const ops = await getOperations();
  // Opérations rapportables : terminées d'abord, puis en cours.
  const operations = [...ops.operations.terminees, ...ops.operations.encours].map((o) => ({ id: o.id, titre: o.titre, lieu: o.lieu }));
  return (
    <>
      <div>
        <h1 className="font-display text-[1.9rem] leading-none tracking-[0.01em]">Documents</h1>
        <p className="mt-1.5 font-display text-[0.9rem] italic text-muted">Rédige un document officiel en un clic — l&apos;IA écrit dans le ton, tu relis, tu imprimes.</p>
      </div>
      <SectionTitle tone="var(--accent)" icon={FileText}>Générateur de documents</SectionTitle>
      <GenerateurDocuments operations={operations} />
    </>
  );
}
