import { getCertificats } from "@/lib/dispensaire-docs";
import { DispensaireCertificats } from "@/components/dispensaire-certificats";

export const dynamic = "force-dynamic";

export default async function DispensaireCertificatsPage() {
  const data = await getCertificats();
  return <DispensaireCertificats data={data} />;
}
