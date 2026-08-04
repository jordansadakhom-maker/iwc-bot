import { Users, UserCheck, Moon, HeartPulse, Coins, type LucideIcon } from "lucide-react";
import { getMembres } from "@/lib/queries";
import { getActeur } from "@/lib/authz";
import { PageHeader, Card, CardHeader, Empty } from "@/components/ui";
import { BarresH } from "@/components/charts";
import { MembresListe } from "@/components/membres-liste";
import { cents } from "@/lib/format";

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

  // Synthèse du registre RH (bandeau de plaques).
  const st = (s: string) => membres.filter((m) => (m.statut || "").toLowerCase() === s).length;
  const medecins = membres.filter((m) => m.ficheRH?.medecin).length;
  const masse = membres.reduce((a, m) => a + (Number(m.ficheRH?.salaire) || 0), 0);
  const kpis: { icon: LucideIcon; label: string; val: string; sous: string }[] = [
    { icon: Users, label: "Effectif", val: String(membres.length), sous: `${iwc.length} Iron Wolf · ${conf.length} Confrérie` },
    { icon: UserCheck, label: "Actifs", val: String(st("actif")), sous: "en service" },
    { icon: Moon, label: "Absents", val: String(st("absent")), sous: "en congé / absence" },
    { icon: HeartPulse, label: "Médecins habilités", val: String(medecins), sous: "accès au dossier médical" },
    { icon: Coins, label: "Masse salariale", val: "$" + cents(masse), sous: "total des fiches RH" },
  ];

  return (
    <>
      <PageHeader titre="Membres & RH" sous={connecte ? "Livret matricule de la compagnie — synchronisé avec Discord" : "Synchronisé avec ton serveur Discord"} actif={connecte} />
      {membres.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {kpis.map((k) => {
            const Icon = k.icon;
            return (
              <div key={k.label} className="rounded-card border border-border p-4 shadow-card" style={{ background: "linear-gradient(180deg,color-mix(in srgb,var(--surface) 94%,var(--brass)),color-mix(in srgb,var(--surface) 86%,#000))" }}>
                <div className="flex items-center gap-1.5 text-[0.64rem] font-semibold uppercase tracking-[0.1em] text-faint"><Icon className="h-3.5 w-3.5" style={{ color: "var(--brass)" }} /> {k.label}</div>
                <div className="mt-2 font-num text-[1.5rem] font-semibold tabular" style={{ color: "var(--brass-hi)" }}>{k.val}</div>
                <div className="mt-0.5 text-[0.66rem] text-faint">{k.sous}</div>
              </div>
            );
          })}
        </div>
      ) : null}
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
