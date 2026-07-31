import { getStock } from "@/lib/dispensaire-stock";
import { DispensaireStockage } from "@/components/dispensaire-stockage";

export const dynamic = "force-dynamic";

// Les matières premières sont désormais des articles du stock mutualisé, catégorie
// « matiere » : on réutilise EXACTEMENT le même écran que le Stockage médical,
// restreint à cette catégorie (prop `scope` 100 % sérialisable → frontière RSC saine).
export default async function DispensaireMatieresPage() {
  const data = await getStock();
  return <DispensaireStockage data={data} scope="matiere" />;
}
