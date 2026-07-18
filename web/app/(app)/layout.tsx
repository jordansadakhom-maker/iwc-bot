import { Shell } from "@/components/shell";
import { isBaseConnected } from "@/lib/queries";

// Coquille de l'application (barre latérale + header) partagée par toutes les pages internes.
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const connecte = await isBaseConnected();
  return <Shell connecte={connecte}>{children}</Shell>;
}
