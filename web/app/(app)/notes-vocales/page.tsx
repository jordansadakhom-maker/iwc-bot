import { PageHeader } from "@/components/ui";
import { NotesVocales } from "@/components/notes-vocales";

export const dynamic = "force-dynamic";

export default function NotesVocalesPage() {
  return (
    <>
      <PageHeader titre="Notes vocales" sous="Capte ta voix au micro → rapport de terrain immersif (IA), comme sur Discord." />
      <NotesVocales />
    </>
  );
}
