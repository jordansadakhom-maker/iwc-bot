import { Car } from "lucide-react";
import { getInventaire } from "@/lib/queries";
import { PageHeader, Card, CardHeader, Empty, Badge } from "@/components/ui";
import { Armurerie } from "@/components/armurerie";

export const dynamic = "force-dynamic";

export default async function InventairePage() {
  const { connecte, vehicules, armes, pole } = await getInventaire();

  return (
    <>
      <PageHeader titre="Armurerie &amp; Inventaire" sous="Registre d'armes croqué à l'encre &amp; véhicules" actif={connecte} pole={pole} />

      <Card>
        <Armurerie armes={armes} />
      </Card>

      <Card>
        <CardHeader titre="Véhicules" compteur={vehicules.length} />
        {vehicules.length === 0 ? (
          <Empty icon={Car}>Aucun véhicule enregistré sur le bot pour l&apos;instant.</Empty>
        ) : (
          <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
            {vehicules.map((v) => (
              <div key={v.id} className="rounded-[11px] border border-border bg-surface-2 px-3 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 truncate text-[0.88rem] font-semibold">{v.nom}</div>
                  <Badge tone={v.pole === "illegal" ? "oxblood" : "accent"}>{v.pole === "illegal" ? "Confrérie" : "Iron Wolf"}</Badge>
                </div>
                <div className="mt-2 flex items-center gap-2 text-[0.72rem] text-muted">
                  {v.type ? <span>{v.type}</span> : null}
                  {v.etat ? <span className="text-faint">· {v.etat}</span> : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}
