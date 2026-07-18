import { HeartPulse, Bandage, Pill, Stethoscope } from "lucide-react";
import { getMedical } from "@/lib/queries";
import { PageHeader, Card, CardHeader, Empty, Badge } from "@/components/ui";

export const dynamic = "force-dynamic";

const STATUT_TONE: Record<string, "good" | "warn" | "muted" | "oxblood"> = {
  apte: "good", observation: "warn", inapte: "oxblood", non_teste: "muted",
};
const STATUT_LABEL: Record<string, string> = {
  apte: "Apte", observation: "En observation", inapte: "Inapte", non_teste: "Non testé",
};

export default async function MedicalPage() {
  const { connecte, dossiers } = await getMedical();

  return (
    <>
      <PageHeader titre="Médical" sous="Dossiers de suivi des patients (Confrérie)" actif={connecte} />
      <Card>
        <CardHeader titre="Dossiers médicaux" compteur={dossiers.length} />
        {dossiers.length === 0 ? (
          <Empty icon={HeartPulse}>
            Aucun dossier médical synchronisé pour l&apos;instant. Les suivis créés sur Discord (blessures, ordonnances, traitements) apparaîtront ici.
          </Empty>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {dossiers.map((d) => (
              <div key={d.id} className="rounded-[12px] border border-border bg-surface-2 px-3.5 py-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 truncate text-[0.92rem] font-semibold">{d.nom}</div>
                  <Badge tone={STATUT_TONE[d.statut?.toLowerCase()] ?? "muted"}>{STATUT_LABEL[d.statut?.toLowerCase()] ?? d.statut}</Badge>
                </div>
                <div className="mt-3 flex items-center gap-4 text-[0.74rem] text-muted">
                  <span className="inline-flex items-center gap-1.5"><Bandage className="h-3.5 w-3.5 text-faint" strokeWidth={1.8} /> {d.blessures} blessure(s)</span>
                  <span className="inline-flex items-center gap-1.5"><Pill className="h-3.5 w-3.5 text-faint" strokeWidth={1.8} /> {d.ordonnances} ordo.</span>
                  <span className="inline-flex items-center gap-1.5"><Stethoscope className="h-3.5 w-3.5 text-faint" strokeWidth={1.8} /> {d.suivis} soin(s)</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}
