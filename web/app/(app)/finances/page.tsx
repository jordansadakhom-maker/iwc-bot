import { getFinances, getFactures, getPortefeuilles } from "@/lib/queries";
import { PageHeader, Card, CardHeader } from "@/components/ui";
import { BarresH } from "@/components/charts";
import { FinancesCoffres } from "@/components/finances-coffres";
import { FacturesListe } from "@/components/factures-liste";
import { Portefeuilles } from "@/components/portefeuilles";
import { cents } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function FinancesPage() {
  const [{ connecte, coffres, pole }, fact, porte] = await Promise.all([getFinances(), getFactures(), getPortefeuilles()]);
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
        (() => {
          // Chaque coffre garde SA couleur d'identité (comme sur le tableau de
          // bord) → on distingue d'un coup d'œil. Palette validée (contraste + CVD).
          const barres = [
            { label: "Coffre commun", value: coffres.commun ?? 0, color: "#c98500" },
            { label: "Coffre Iron Wolf", value: coffres.legal ?? 0, color: "#3987e5" },
            { label: "Coffre Confrérie", value: coffres.illegal ?? 0, color: "#e66767" },
            { label: "Coffre Van Horn", value: coffres.vanhorn ?? 0, color: "#9085e9" },
          ];
          const totalCoffres = barres.reduce((a, b) => a + b.value, 0);
          return (
            <Card>
              <CardHeader titre="Comparatif des coffres (tous pôles)" compteur={`total : $${cents(totalCoffres)}`} />
              <BarresH data={barres} money share />
            </Card>
          );
        })()
      ) : null}

      <Card>
        <Portefeuilles portefeuilles={porte.portefeuilles} transactions={porte.transactions} membres={porte.membres} total={porte.total} />
      </Card>

      <Card>
        <FacturesListe factures={fact.factures} total={fact.total} />
      </Card>
    </>
  );
}
