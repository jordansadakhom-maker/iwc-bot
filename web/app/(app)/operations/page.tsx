import { Target, FileText } from "lucide-react";
import { getOperations } from "@/lib/queries";
import { PageHeader, Card, CardHeader, Empty, Badge } from "@/components/ui";

export const dynamic = "force-dynamic";

const STATUT_TONE: Record<string, "good" | "warn" | "muted" | "accent"> = {
  en_attente: "warn", valide: "good", signe: "good", termine: "muted", annule: "muted", refuse: "muted",
};

function money(v: string | null) {
  return v && v.trim() ? v : "—";
}

export default async function OperationsPage() {
  const data = await getOperations();
  const { preparation, encours, terminees } = data.operations;
  const totalOps = preparation.length + encours.length + terminees.length;

  return (
    <>
      <PageHeader titre="Opérations & Contrats" sous="Synchronisé avec ton salon #operations" actif={data.connecte} pole={data.pole} />

      <Card>
        <CardHeader titre="Opérations" compteur={totalOps} />
        {totalOps === 0 ? (
          <Empty icon={Target}>
            Aucune opération synchronisée pour l&apos;instant. Elles apparaîtront ici automatiquement (préparation par étapes, en cours, puis terminées) dès qu&apos;elles seront créées sur Discord.
          </Empty>
        ) : (
          <div className="grid gap-4 lg:grid-cols-3">
            {([["preparation", "Préparation", preparation], ["encours", "En cours", encours], ["terminees", "Terminées", terminees]] as const).map(([key, label, list]) => (
              <div key={key}>
                <div className="mb-2.5 flex items-center gap-2 text-[0.72rem] uppercase tracking-[0.08em] text-muted">
                  {label} <span className="ml-auto font-num text-faint">{list.length}</span>
                </div>
                <div className="flex flex-col gap-2.5">
                  {list.length === 0 ? (
                    <div className="rounded-[11px] border border-dashed border-border px-3 py-4 text-center text-[0.72rem] text-faint">—</div>
                  ) : list.map((o) => (
                    <div key={o.id} className="rounded-[11px] border border-border bg-surface-2 px-3 py-2.5">
                      <div className="text-[0.85rem] font-semibold">{o.titre}</div>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-[0.7rem] text-muted">
                        <Badge>{o.type}</Badge>
                        {o.membres > 0 ? <span>{o.membres} agent(s)</span> : null}
                        {o.prime ? <span className="font-num">{o.prime}</span> : null}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <CardHeader titre="Contrats" compteur={data.contrats.length} />
        {data.contrats.length === 0 ? (
          <Empty icon={FileText}>
            Aucun contrat synchronisé pour l&apos;instant. Les contrats (Iron Wolf &amp; Confrérie) remonteront ici dès leur création sur Discord.
          </Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-left text-[0.85rem]">
              <thead>
                <tr className="text-[0.7rem] uppercase tracking-[0.06em] text-faint">
                  <th className="border-b border-border px-2.5 py-2 font-semibold">Objet</th>
                  <th className="border-b border-border px-2.5 py-2 font-semibold">Commanditaire</th>
                  <th className="border-b border-border px-2.5 py-2 font-semibold">Pôle</th>
                  <th className="border-b border-border px-2.5 py-2 font-semibold">Rémunération</th>
                  <th className="border-b border-border px-2.5 py-2 font-semibold">Statut</th>
                </tr>
              </thead>
              <tbody>
                {data.contrats.map((c) => (
                  <tr key={c.id} className="hover:bg-[color-mix(in_srgb,var(--ink)_4%,transparent)]">
                    <td className="border-b border-border px-2.5 py-2.5 font-medium">{c.cible}</td>
                    <td className="border-b border-border px-2.5 py-2.5 text-muted">{c.commanditaire || "—"}</td>
                    <td className="border-b border-border px-2.5 py-2.5">
                      <Badge tone={c.pole === "illegal" ? "oxblood" : "accent"}>{c.pole === "illegal" ? "Confrérie" : "Iron Wolf"}</Badge>
                    </td>
                    <td className="border-b border-border px-2.5 py-2.5 font-num text-muted">{money(c.remuneration)}</td>
                    <td className="border-b border-border px-2.5 py-2.5">
                      <Badge tone={STATUT_TONE[c.statut?.toLowerCase()] ?? "muted"}>{c.statut}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
