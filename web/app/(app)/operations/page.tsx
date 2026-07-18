import { FileText } from "lucide-react";
import { getOperations } from "@/lib/queries";
import { PageHeader, Card, CardHeader, Empty, Badge } from "@/components/ui";
import { OperationsBoard } from "@/components/operations-board";

export const dynamic = "force-dynamic";

const STATUT_TONE: Record<string, "good" | "warn" | "muted" | "accent"> = {
  en_attente: "warn", valide: "good", signe: "good", termine: "muted", annule: "muted", refuse: "muted",
};

function money(v: string | null) {
  return v && v.trim() ? v : "—";
}

export default async function OperationsPage() {
  const data = await getOperations();

  return (
    <>
      <PageHeader titre="Opérations & Contrats" sous="Créer et modifier tes opérations — en direct" actif={data.connecte} pole={data.pole} />

      <Card>
        <OperationsBoard operations={data.operations} />
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
