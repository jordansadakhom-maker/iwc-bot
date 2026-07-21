import { HeartPulse } from "lucide-react";
import { getMedical, getMembres, getAcces } from "@/lib/queries";
import { PageHeader, Card, CardHeader, Empty } from "@/components/ui";
import { MedicalGrid } from "@/components/medical-grid";
import { AccesReserve } from "@/components/acces-reserve";

export const dynamic = "force-dynamic";

export default async function MedicalPage() {
  const acces = await getAcces();
  if (!acces.peutMedical) return <AccesReserve titre="Médical" detail="Les dossiers médicaux sont réservés au médecin de la compagnie et à la Direction." />;
  const [{ connecte, dossiers }, { membres }] = await Promise.all([getMedical(), getMembres()]);
  // Membres proposables pour un nouveau dossier (ceux sans dossier existant).
  const avecDossier = new Set(dossiers.map((d) => d.membreId));
  const membresLibres = membres
    .filter((m) => !avecDossier.has(m.id))
    .map((m) => ({ id: m.id, nom: m.nomIC }));

  return (
    <>
      <PageHeader titre="Médical" sous="Dossiers de suivi — modifiables en direct" actif={connecte} />
      <Card>
        <div className="mb-3.5 flex items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5">
            <h3 className="text-[0.8rem] font-semibold uppercase tracking-[0.06em] text-muted">Dossiers médicaux</h3>
            <span className="font-num text-[0.8rem] text-faint">{dossiers.length}</span>
          </div>
        </div>
        {dossiers.length === 0 && membresLibres.length === 0 ? (
          <Empty icon={HeartPulse}>
            Aucun dossier médical pour l&apos;instant. Ouvre-en un avec « Nouveau dossier ».
          </Empty>
        ) : (
          <>
            <p className="mb-3 text-[0.76rem] text-faint">Clique sur un patient pour voir et modifier sa fiche (statut, blessures, ordonnances, notes).</p>
            <MedicalGrid dossiers={dossiers} membresLibres={membresLibres} />
          </>
        )}
      </Card>
    </>
  );
}
