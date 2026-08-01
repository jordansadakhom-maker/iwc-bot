import { getCoffresInventaire } from "@/lib/dispensaire-stock";
import { DispensaireCoffres } from "@/components/dispensaire-coffres";

export const dynamic = "force-dynamic";

// Les matières premières réutilisent EXACTEMENT l'écran « Stock Matériel Médical »
// (composant DispensaireCoffres) — coffres, ajout/renommage/suppression de coffres,
// rangement et déplacement des objets — restreint à la catégorie « matiere » via la
// prop `scope` (100 % sérialisable → frontière RSC saine). Seules les données changent.
export default async function DispensaireMatieresPage() {
  const data = await getCoffresInventaire();
  return <DispensaireCoffres data={data} scope="matiere" />;
}
