import { HeartPulse } from "lucide-react";
import { getMedical } from "@/lib/queries";
import { PageHeader, Card, CardHeader, Empty } from "@/components/ui";
import { MedicalGrid } from "@/components/medical-grid";

export const dynamic = "force-dynamic";

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
          <>
            <p className="mb-3 text-[0.76rem] text-faint">Clique sur un patient pour voir sa fiche complète (blessures, ordonnances, soins, convalescence, historique).</p>
            <MedicalGrid dossiers={dossiers} />
          </>
        )}
      </Card>
    </>
  );
}
