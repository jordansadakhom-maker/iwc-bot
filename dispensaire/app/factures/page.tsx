import { Coquille } from "@/components/coquille";
import { Factures } from "@/components/factures";
import { getPatients, dbPrete } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function Page() {
  const pret = dbPrete();
  // Seuls les NOMS des patients sont exposés (autocomplétion) ; les montants restent protégés par code.
  const patientsRaw = pret ? await getPatients() : [];
  const patients = patientsRaw.map((p) => [p.prenom, p.nom].filter(Boolean).join(" ")).filter(Boolean);
  return (
    <Coquille actif="/factures" pret={pret}>
      <Factures patients={patients} />
    </Coquille>
  );
}
