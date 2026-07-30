import { getComptabilite } from "@/lib/dispensaire-comptabilite";
import { peutFacturer } from "@/lib/dispensaire-roles";
import { DispensaireComptabilite } from "@/components/dispensaire-comptabilite";
import { AccesDirection } from "@/components/dispensaire-acces-direction";

export const dynamic = "force-dynamic";

export default async function DispensaireComptabilitePage() {
  if (!(await peutFacturer())) return <AccesDirection sous="La comptabilité est réservée à la direction et aux responsables de la facturation." />;
  const data = await getComptabilite();
  return <DispensaireComptabilite data={data} />;
}
