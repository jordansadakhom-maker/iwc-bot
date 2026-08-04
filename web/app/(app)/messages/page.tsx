import { MessagesSquare, MailOpen, Archive } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { PlaqueBand } from "@/components/registre-ui";
import { Messagerie } from "@/components/messagerie";
import { listerConversations } from "./actions";

export const dynamic = "force-dynamic";

export default async function MessagesPage() {
  const { connecte, moiId, conversations } = await listerConversations();
  const nonLues = conversations.filter((c) => c.nonLu && c.statut !== "archivee").length;
  const archivees = conversations.filter((c) => c.statut === "archivee").length;
  const band = [
    { icon: MessagesSquare, label: "Conversations", val: String(conversations.length), sous: "au total" },
    { icon: MailOpen, label: "Non lues", val: String(nonLues), sous: "à traiter" },
    { icon: Archive, label: "Archivées", val: String(archivees), sous: "classées" },
  ];
  return (
    <>
      <PageHeader
        titre="Messagerie"
        sous={connecte ? (nonLues > 0 ? `${nonLues} conversation(s) non lue(s) · ${conversations.length} au total` : `${conversations.length} conversation(s)`) : "Fils de discussion internes de la compagnie"}
        actif={connecte}
      />
      {connecte ? (
        <>
          {conversations.length > 0 ? <PlaqueBand items={band} cols={3} /> : null}
          <Messagerie moiId={moiId} conversations={conversations} />
        </>
      ) : (
        <p className="rounded-card border border-border bg-surface p-8 text-center text-[0.9rem] italic text-faint shadow-card">Connecte-toi avec Discord pour accéder à la messagerie interne.</p>
      )}
    </>
  );
}
