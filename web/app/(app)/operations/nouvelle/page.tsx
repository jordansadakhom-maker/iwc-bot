import { redirect } from "next/navigation";
import { getOperations, getSessionProfile } from "@/lib/queries";
import { OperationWizard } from "@/components/operation-wizard";

export const dynamic = "force-dynamic";

// Assistant immersif de création d'opération (« Dossier opérationnel 1904 »).
export default async function NouvelleOperationPage() {
  const [data, profil] = await Promise.all([getOperations(), getSessionProfile().catch(() => null)]);
  if (!data.connecte) redirect("/login");
  const illegal = data.pole === "confrerie";
  const auteur = profil?.nom || (illegal ? "La Confrérie" : "Iron Wolf");
  return <OperationWizard membres={data.membres} pole={illegal ? "illegal" : "legal"} auteur={auteur} />;
}
