import { PageHeader } from "@/components/ui";
import { NotesVocalesModes } from "@/components/notes-vocales-modes";

export const dynamic = "force-dynamic";

export default function NotesVocalesPage() {
  return (
    <>
      <PageHeader titre="Notes vocales" sous="Capte les voix des joueurs en jeu (ou ta voix) → rapport de terrain immersif (IA)." />
      <NotesVocalesModes />
    </>
  );
}
