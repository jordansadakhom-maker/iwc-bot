import { Coquille } from "@/components/coquille";
import { Patients } from "@/components/patients";
import { getPatients, dbPrete } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function Page() {
  const pret = dbPrete();
  const patients = pret ? await getPatients() : [];
  return (
    <Coquille actif="/patients" pret={pret}>
      <Patients patients={patients} />
    </Coquille>
  );
}
