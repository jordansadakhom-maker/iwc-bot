import { Shell } from "@/components/shell";
import { isBaseConnected, getSessionProfile } from "@/lib/queries";

// Coquille de l'application (barre latérale + header) partagée par toutes les pages internes.
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [connecte, profil] = await Promise.all([isBaseConnected(), getSessionProfile()]);
  return (
    <Shell connecte={connecte} profil={profil}>
      {children}
    </Shell>
  );
}
