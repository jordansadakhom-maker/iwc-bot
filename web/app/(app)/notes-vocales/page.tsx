import { PageHeader } from "@/components/ui";
import { NotesVocalesModes } from "@/components/notes-vocales-modes";
import { RapportsListe } from "@/components/rapports-liste";
import { getRapportsTerrain } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function NotesVocalesPage() {
  const rapports = await getRapportsTerrain();
  return (
    <>
      <PageHeader titre="Notes vocales" sous="Capte les voix des joueurs en jeu (ou ta voix) → rapport de terrain immersif (IA). Chaque scène est archivée ci-dessous." />
      <NotesVocalesModes />
      <RapportsListe rapports={rapports} />
    </>
  );
}
