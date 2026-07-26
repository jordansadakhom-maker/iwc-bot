import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getTelegrammes } from "@/lib/queries";
import { PageHeader, Card, CardHeader } from "@/components/ui";
import { TelegrammesPanel } from "@/components/telegrammes-panel";

export const dynamic = "force-dynamic";

// Deep-link : /communication/telegramme/<id> — ouvre directement la conversation
// ciblée (le panneau pré-ouvre la modale du télégramme correspondant).
export default async function TelegrammeDeepLink({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const focusId = decodeURIComponent(id);
  const tg = await getTelegrammes();
  const item = tg.telegrammes.find((t) => t.id === focusId);

  return (
    <>
      <PageHeader titre={item ? `Télégramme — ${item.clientNom}` : "Télégramme"} sous="Conversation ouverte depuis une notification" actif={tg.connecte} />
      <div className="mb-2">
        <Link href="/communication#telegrammes" className="inline-flex items-center gap-1.5 text-[0.8rem] text-muted transition hover:text-ink">
          <ArrowLeft className="h-3.5 w-3.5" /> Tous les télégrammes
        </Link>
      </div>
      <Card>
        <CardHeader titre="Télégrammes" compteur={tg.telegrammes.length} />
        <TelegrammesPanel telegrammes={tg.telegrammes} focusId={focusId} />
      </Card>
    </>
  );
}
