import { getFinances, getFactures } from "@/lib/queries";
import { PageHeader, Card, CardHeader } from "@/components/ui";
import { BarresH } from "@/components/charts";
import { FinancesCoffres } from "@/components/finances-coffres";
import { FacturesListe } from "@/components/factures-liste";

export const dynamic = "force-dynamic";

export default async function FinancesPage() {
  const [{ connecte, coffres, pole }, fact] = await Promise.all([getFinances(), getFactures()]);
  const conf = pole === "confrerie";
  // Vue « pôle actif » : coffre commun + le coffre du pôle choisi (le bouton
  // Iron Wolf / Confrérie du header bascule réellement l'affichage).
  const cartes: { cible: "commun" | "legal" | "illegal"; label: string; val: number | null; tone: string }[] = [
    { cible: "commun", label: "Coffre commun", val: coffres.commun, tone: "var(--accent)" },
    conf
      ? { cible: "illegal", label: "Coffre Confrérie", val: coffres.illegal, tone: "var(--oxblood)" }
      : { cible: "legal", label: "Coffre Iron Wolf", val: coffres.legal, tone: "var(--brass)" },
  ];

  return (
    <>
      <PageHeader titre="Finances" sous="Coffres modifiables — dépôt / retrait" actif={connecte} pole={pole} />

      <FinancesCoffres cartes={cartes} connecte={connecte} />

      {connecte ? (
        <Card>
          <CardHeader titre="Comparatif des coffres (tous pôles)" />
          <BarresH
            data={[
              { label: "Coffre commun", value: coffres.commun ?? 0 },
              { label: "Coffre Iron Wolf", value: coffres.legal ?? 0 },
              { label: "Coffre Confrérie", value: coffres.illegal ?? 0 },
            ]}
            money
          />
        </Card>
      ) : null}

      <Card>
        <FacturesListe factures={fact.factures} total={fact.total} />
      </Card>
    </>
  );
}
