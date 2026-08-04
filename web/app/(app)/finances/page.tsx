import { getFinances, getFactures, getPortefeuilles, getTresorerieEvolution } from "@/lib/queries";
import { getActeur } from "@/lib/authz";
import { PageHeader, Card, CardHeader } from "@/components/ui";
import { TresorerieChart } from "@/components/charts";
import { FinancesCoffres } from "@/components/finances-coffres";
import { FacturesListe } from "@/components/factures-liste";
import { Portefeuilles } from "@/components/portefeuilles";
import { cents } from "@/lib/format";
import { Coins, Receipt, Wallet, ArrowLeftRight, type LucideIcon } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function FinancesPage() {
  const [{ connecte, coffres, pole }, fact, porte, acteur, evolution] = await Promise.all([getFinances(), getFactures(), getPortefeuilles(), getActeur(), getTresorerieEvolution()]);
  const peutDirection = !!acteur?.direction;
  const peutAjusterCoffre = !!acteur?.officier; // officier ou Direction
  const conf = pole === "confrerie";
  // Vue « pôle actif » : coffre commun + le coffre du pôle choisi (le bouton
  // Iron Wolf / Confrérie du header bascule réellement l'affichage).
  const cartes: { cible: "commun" | "legal" | "illegal"; label: string; val: number | null; tone: string }[] = [
    { cible: "commun", label: "Coffre commun", val: coffres.commun, tone: "var(--accent)" },
    conf
      ? { cible: "illegal", label: "Coffre Confrérie", val: coffres.illegal, tone: "var(--oxblood)" }
      : { cible: "legal", label: "Coffre Iron Wolf", val: coffres.legal, tone: "var(--brass)" },
  ];

  // Total en coffre : les quatre coffres de la maison (commun + les deux pôles + Van Horn).
  const totalCoffres = (coffres.commun ?? 0) + (coffres.legal ?? 0) + (coffres.illegal ?? 0) + (coffres.vanhorn ?? 0);

  // Bandeau de synthèse « registre » — l'état de la caisse d'un coup d'œil.
  const kpis: { icon: LucideIcon; label: string; val: string; sous: string }[] = [
    { icon: Coins, label: "Total en coffre", val: connecte ? "$" + cents(totalCoffres) : "—", sous: "tous coffres réunis" },
    { icon: Receipt, label: "Encaissé", val: "$" + cents(fact.total), sous: `${fact.factures.length} quittance(s)` },
    { icon: Wallet, label: "En circulation", val: "$" + cents(porte.total), sous: `${porte.portefeuilles.length} portefeuille(s)` },
    { icon: ArrowLeftRight, label: "Mouvements", val: String(porte.transactions.length), sous: "au grand-livre" },
  ];

  return (
    <>
      <PageHeader titre="Finances" sous="Grand-livre & coffre — dépôts, retraits, quittances" actif={connecte} pole={pole} />

      {/* Bandeau de synthèse (plaques de laiton) */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((k) => {
          const Icon = k.icon;
          return (
            <div key={k.label} className="rounded-card border border-border p-4 shadow-card" style={{ background: "linear-gradient(180deg,color-mix(in srgb,var(--surface) 94%,var(--brass)),color-mix(in srgb,var(--surface) 86%,#000))" }}>
              <div className="flex items-center gap-1.5 text-[0.64rem] font-semibold uppercase tracking-[0.1em] text-faint"><Icon className="h-3.5 w-3.5" style={{ color: "var(--brass)" }} /> {k.label}</div>
              <div className="mt-2 font-num text-[1.5rem] font-semibold tabular" style={{ color: connecte ? "var(--brass-hi)" : "var(--faint)" }}>{k.val}</div>
              <div className="mt-0.5 text-[0.68rem] text-faint">{k.sous}</div>
            </div>
          );
        })}
      </div>

      <FinancesCoffres cartes={cartes} connecte={connecte} peut={peutAjusterCoffre} />

      {connecte ? (
        <Card>
          <CardHeader titre="Évolution du coffre — trésorerie (tous pôles)" compteur={`total : $${cents(totalCoffres)}`} />
          <TresorerieChart points={evolution.points} />
        </Card>
      ) : null}

      <Card>
        <Portefeuilles portefeuilles={porte.portefeuilles} transactions={porte.transactions} membres={porte.membres} total={porte.total} peutDirection={peutDirection} />
      </Card>

      <Card>
        <FacturesListe factures={fact.factures} total={fact.total} />
      </Card>
    </>
  );
}
