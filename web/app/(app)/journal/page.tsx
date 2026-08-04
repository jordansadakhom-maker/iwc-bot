import { CalendarCheck, ScrollText } from "lucide-react";
import { getJournal } from "@/lib/queries";
import { PageHeader } from "@/components/ui";
import { PlaqueBand } from "@/components/registre-ui";
import { JournalBord } from "@/components/journal-bord";
import { JournalScans } from "@/components/journal-scans";

export const dynamic = "force-dynamic";

export default async function JournalPage() {
  const { connecte, rdvs, scans } = await getJournal();
  const band = [
    { icon: CalendarCheck, label: "Rendez-vous clôturés", val: String(rdvs.length), sous: "au journal" },
    { icon: ScrollText, label: "Contrôles armurerie", val: String(scans.length), sous: "cohérence" },
  ];
  return (
    <>
      <PageHeader titre="Journal de bord" sous={`Cohérence de l'armurerie & rendez-vous clôturés${rdvs.length ? ` · ${rdvs.length}` : ""}`} actif={connecte} />
      {connecte ? <PlaqueBand items={band} cols={2} /> : null}
      <JournalScans scans={scans} />
      <JournalBord rdvs={rdvs} />
    </>
  );
}
