import { getFDO } from "@/lib/dispensaire-facturation";
import { DispensaireFDO } from "@/components/dispensaire-fdo";

export const dynamic = "force-dynamic";

export default async function DispensaireFDOPage() {
  const data = await getFDO();
  return <DispensaireFDO data={data} />;
}
