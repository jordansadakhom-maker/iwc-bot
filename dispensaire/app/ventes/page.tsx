import { Coquille } from "@/components/coquille";
import { Ventes } from "@/components/ventes";
import { getVentesSemaine, getPatients, dbPrete } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function Page() {
  const pret = dbPrete();
  const [ventes, patientsRaw] = pret ? await Promise.all([getVentesSemaine(), getPatients()]) : [[], []];
  const patients = patientsRaw.map((p) => [p.prenom, p.nom].filter(Boolean).join(" ")).filter(Boolean);
  return (
    <Coquille actif="/ventes" pret={pret}>
      <Ventes ventes={ventes} patients={patients} />
    </Coquille>
  );
}
