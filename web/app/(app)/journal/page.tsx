import { getJournal } from "@/lib/queries";
import { PageHeader } from "@/components/ui";
import { JournalBord } from "@/components/journal-bord";
import { JournalScans } from "@/components/journal-scans";

export const dynamic = "force-dynamic";

export default async function JournalPage() {
  const { connecte, rdvs, scans } = await getJournal();
  return (
    <>
      <PageHeader titre="Journal de bord" sous={`Cohérence de l'armurerie & rendez-vous clôturés${rdvs.length ? ` · ${rdvs.length}` : ""}`} actif={connecte} />
      <JournalScans scans={scans} />
      <JournalBord rdvs={rdvs} />
    </>
  );
}
