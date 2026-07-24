import { Users } from "lucide-react";
import { getMembres } from "@/lib/queries";
import { getActeur } from "@/lib/authz";
import { PageHeader, Card, CardHeader, Empty } from "@/components/ui";
import { BarresH } from "@/components/charts";
import { MembresListe } from "@/components/membres-liste";

export const dynamic = "force-dynamic";

const ORDRE_GRADES: [string, string][] = [
  ["Fondateur", "Fondateur"],
  ["Le Conseil — Directeur / Co-Directeur", "Le Conseil"],
  ["Officier de Terrain", "Officier de Terrain"],
  ["Agent Confirmé", "Agent Confirmé"],
  ["Opérateur", "Opérateur"],
  ["Recrue — Probatoire", "Recrue"],
];
const RANG = new Map(ORDRE_GRADES.map(([g], i) => [g, i]));
const parRang = <T extends { grade: string | null; nomIC: string }>(a: T, b: T) => {
  const ra = RANG.has(a.grade || "") ? (RANG.get(a.grade || "") as number) : 999;
  const rb = RANG.has(b.grade || "") ? (RANG.get(b.grade || "") as number) : 999;
  return ra !== rb ? ra - rb : (a.nomIC || "").localeCompare(b.nomIC || "");
};

export default async function MembresPage() {
  const [{ connecte, membres }, acteur] = await Promise.all([getMembres(), getActeur()]);
  // Édition RH réservée aux officiers / direction ; habilitation médecin à la
  // direction seule. Même règle (fail-closed) que le serveur majFicheMembre, pour
  // que l'UI ne propose jamais une action qui serait de toute façon refusée.
  const peutEditer = !!acteur?.officier;
  const peutHabiliterMedecin = !!acteur?.direction;
  // Hiérarchie lisible de haut en bas (Fondateur → Recrue), par pôle.
  const iwc = membres.filter((m) => m.pole !== "illegal").sort(parRang);
  const conf = membres.filter((m) => m.pole === "illegal").sort(parRang);

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
        <MembresListe iwc={iwc} conf={conf} peutEditer={peutEditer} peutHabiliterMedecin={peutHabiliterMedecin} />
      )}
    </>
  );
}
