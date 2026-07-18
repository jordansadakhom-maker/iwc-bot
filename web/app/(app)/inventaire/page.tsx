import { Boxes, Crosshair, Car } from "lucide-react";
import { getInventaire } from "@/lib/queries";
import { PageHeader, Card, CardHeader, Empty, Badge } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function InventairePage() {
  const { connecte, vehicules, armes } = await getInventaire();

  return (
    <>
      <PageHeader titre="Inventaire" sous="Registre d'armes &amp; véhicules" actif={connecte} />

      <Card>
        <CardHeader titre="Registre d'armes" compteur={armes.length} />
        {armes.length === 0 ? (
          <Empty icon={Crosshair}>
            Aucune arme synchronisée. Une fois la table créée (voir instructions), ton registre d&apos;armes Discord (numéros de série, détenteurs) s&apos;affichera ici.
          </Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-left text-[0.85rem]">
              <thead>
                <tr className="text-[0.7rem] uppercase tracking-[0.06em] text-faint">
                  <th className="border-b border-border px-2.5 py-2 font-semibold">N° de série</th>
                  <th className="border-b border-border px-2.5 py-2 font-semibold">Type</th>
                  <th className="border-b border-border px-2.5 py-2 font-semibold">Catégorie</th>
                  <th className="border-b border-border px-2.5 py-2 font-semibold">Appartenance</th>
                  <th className="border-b border-border px-2.5 py-2 font-semibold">Détenteur</th>
                </tr>
              </thead>
              <tbody>
                {armes.map((a) => (
                  <tr key={a.id} className="hover:bg-[color-mix(in_srgb,var(--ink)_4%,transparent)]">
                    <td className="border-b border-border px-2.5 py-2.5 font-num font-medium">{a.serie}</td>
                    <td className="border-b border-border px-2.5 py-2.5">{a.type || "—"}</td>
                    <td className="border-b border-border px-2.5 py-2.5 text-muted">{a.categorie || "—"}</td>
                    <td className="border-b border-border px-2.5 py-2.5">
                      {a.pole ? <Badge tone={a.pole === "illegal" ? "oxblood" : "accent"}>{a.appartenance || (a.pole === "illegal" ? "Confrérie" : "Iron Wolf")}</Badge> : <span className="text-muted">{a.appartenance || "—"}</span>}
                    </td>
                    <td className="border-b border-border px-2.5 py-2.5 text-muted">{a.membreNom || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
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
