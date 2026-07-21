import { Users } from "lucide-react";
import { getMembres } from "@/lib/queries";
import { PageHeader, Card, CardHeader, Empty } from "@/components/ui";
import { BarresH } from "@/components/charts";
import { MembreRow } from "@/components/membre-row";

export const dynamic = "force-dynamic";

const ORDRE_GRADES: [string, string][] = [
  ["Fondateur", "Fondateur"],
  ["Le Conseil — Directeur / Co-Directeur", "Le Conseil"],
  ["Officier de Terrain", "Officier de Terrain"],
  ["Agent Confirmé", "Agent Confirmé"],
  ["Opérateur", "Opérateur"],
  ["Recrue — Probatoire", "Recrue"],
];

export default async function MembresPage() {
  const { connecte, membres } = await getMembres();
  const iwc = membres.filter((m) => m.pole !== "illegal");
  const conf = membres.filter((m) => m.pole === "illegal");

  function Bloc({ titre, tone, list }: { titre: string; tone: "accent" | "oxblood"; list: typeof membres }) {
    return (
      <Card>
        <CardHeader titre={titre} compteur={list.length} />
        {list.length === 0 ? (
          <Empty icon={Users}>Aucun membre synchronisé dans ce pôle pour l&apos;instant.</Empty>
        ) : (
          <div className="flex flex-col divide-y divide-border">
            {list.map((m) => <MembreRow key={m.id} m={m} tone={tone} />)}
          </div>
        )}
      </Card>
    );
  }

  const gradeCount = new Map<string, number>();
  for (const m of membres) gradeCount.set(m.grade || "—", (gradeCount.get(m.grade || "—") || 0) + 1);
  const parGrade = ORDRE_GRADES.map(([g, court]) => ({ label: court, value: gradeCount.get(g) || 0 })).filter((x) => x.value > 0);

  return (
    <>
      <PageHeader titre="Membres & RH" sous={connecte ? `${membres.length} membre(s) synchronisé(s) depuis Discord` : "Synchronisé avec ton serveur Discord"} actif={connecte} />
      {parGrade.length > 0 ? (
        <Card>
          <CardHeader titre="Répartition par grade" />
          <BarresH data={parGrade} />
        </Card>
      ) : null}
      {membres.length === 0 ? (
        <Card>
          <Empty icon={Users}>
            Aucun membre synchronisé pour l&apos;instant. La meute apparaîtra ici automatiquement dès que le bot pousse ses données.
          </Empty>
        </Card>
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-2">
          <Bloc titre="Iron Wolf Company" tone="accent" list={iwc} />
          <Bloc titre="La Confrérie" tone="oxblood" list={conf} />
        </div>
      )}
    </>
  );
}
