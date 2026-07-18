import { Shell } from "@/components/shell";

// Coquille de l'application (barre latérale + header) partagée par toutes les pages internes.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <Shell>{children}</Shell>;
}
