import { LineChart } from "lucide-react";
import { getFinances } from "@/lib/queries";
import { PageHeader, Card, CardHeader, Empty } from "@/components/ui";
import { BarresH } from "@/components/charts";
import { FinancesCoffres } from "@/components/finances-coffres";

export const dynamic = "force-dynamic";

function money(n: number | null) {
  return n === null || n === undefined ? "—" : "$" + n.toLocaleString("fr-FR");
}

export default async function FinancesPage() {
  const { connecte, coffres, pole } = await getFinances();
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
            format={money}
          />
        </Card>
      ) : null}

      <Card>
        <CardHeader titre="Mouvements — 30 derniers jours" />
        <Empty icon={LineChart}>
          Le détail des entrées et sorties (avec courbe et export) s&apos;affichera ici une fois l&apos;historique des transactions synchronisé. Les soldes ci-dessus, eux, sont déjà en direct.
        </Empty>
      </Card>
    </>
  );
}
