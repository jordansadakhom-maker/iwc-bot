import { Shell } from "@/components/shell";
import { isBaseConnected, getSessionProfile, getPole } from "@/lib/queries";

// Coquille de l'application (barre latérale + header) partagée par toutes les pages internes.
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [connecte, profil, pole] = await Promise.all([isBaseConnected(), getSessionProfile(), getPole()]);
  return (
    <Shell connecte={connecte} profil={profil} initialPole={pole}>
      {children}
    </Shell>
  );
}
