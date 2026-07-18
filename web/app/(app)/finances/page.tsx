import { Wallet, Landmark, Skull, LineChart } from "lucide-react";
import { getFinances } from "@/lib/queries";
import { PageHeader, Card, CardHeader, Empty } from "@/components/ui";
import { BarresH } from "@/components/charts";

export const dynamic = "force-dynamic";

function money(n: number | null) {
  return n === null || n === undefined ? "—" : "$" + n.toLocaleString("fr-FR");
}

export default async function FinancesPage() {
  const { connecte, coffres, pole } = await getFinances();
  const conf = pole === "confrerie";
  // Vue « pôle actif » : coffre commun + le coffre du pôle choisi (le bouton
  // Iron Wolf / Confrérie du header bascule réellement l'affichage).
  const cartes = [
    { label: "Coffre commun", val: coffres.commun, icon: Wallet, tone: "var(--accent)" },
    conf
      ? { label: "Coffre Confrérie", val: coffres.illegal, icon: Skull, tone: "var(--oxblood)" }
      : { label: "Coffre Iron Wolf", val: coffres.legal, icon: Landmark, tone: "var(--brass)" },
  ];

  return (
    <>
      <PageHeader titre="Finances" sous="Coffres synchronisés avec Discord" actif={connecte} pole={pole} />

      <div className="grid gap-4 sm:grid-cols-2">
        {cartes.map((c) => {
          const Icon = c.icon;
          return (
            <Card key={c.label}>
              <div className="flex items-center justify-between">
                <span className="text-[0.72rem] font-semibold uppercase tracking-[0.09em] text-muted">{c.label}</span>
                <span className="grid h-[30px] w-[30px] place-items-center rounded-[9px]" style={{ color: c.tone, background: "color-mix(in srgb, " + c.tone + " 15%,transparent)" }}>
                  <Icon className="h-4 w-4" strokeWidth={1.8} />
                </span>
              </div>
              <div className={"tabular mb-1 mt-3 font-num text-[1.9rem] font-semibold " + (connecte ? "text-ink" : "text-faint")}>{connecte ? money(c.val) : "—"}</div>
              <div className="text-[0.72rem] text-faint">{connecte ? "À jour" : "En attente de la base"}</div>
            </Card>
          );
        })}
      </div>

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
