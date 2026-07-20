import { Coquille } from "@/components/coquille";
import { Certificats } from "@/components/certificats";
import { getCertificats, getPatients, dbPrete } from "@/lib/data";

export const dynamic = "force-dynamic";

// Toujours affiché : impression / copie fonctionnent même sans base reliée.
export default async function Page() {
  const pret = dbPrete();
  const [archive, patientsRaw] = pret ? await Promise.all([getCertificats(), getPatients()]) : [[], []];
  const patients = patientsRaw.map((p) => [p.prenom, p.nom].filter(Boolean).join(" ")).filter(Boolean);
  return (
    <Coquille actif="/certificats" pret={true}>
      <Certificats archive={archive} patients={patients} />
    </Coquille>
  );
}
