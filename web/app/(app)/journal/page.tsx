import { getJournal } from "@/lib/queries";
import { PageHeader } from "@/components/ui";
import { JournalBord } from "@/components/journal-bord";

export const dynamic = "force-dynamic";

export default async function JournalPage() {
  const { connecte, rdvs } = await getJournal();
  return (
    <>
      <PageHeader titre="Journal de bord" sous={`Rendez-vous clôturés — suivi complet${rdvs.length ? ` · ${rdvs.length}` : ""}`} actif={connecte} />
      <JournalBord rdvs={rdvs} />
    </>
  );
}
