import { getStock } from "@/lib/dispensaire-stock";
import { DispensaireInventaire } from "@/components/dispensaire-inventaire";

// Toujours frais : l'inventaire global se recalcule à chaque visite depuis les
// mêmes tables que le stock (aucune base propre — synchronisation automatique).
export const dynamic = "force-dynamic";

export default async function DispensaireInventairePage() {
  const data = await getStock();
  return <DispensaireInventaire data={data} />;
}
