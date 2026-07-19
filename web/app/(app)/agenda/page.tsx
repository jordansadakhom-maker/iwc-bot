import { Users } from "lucide-react";
import { getAgenda } from "@/lib/queries";
import { PageHeader, Card, CardHeader, Empty } from "@/components/ui";
import { ContactsGrid } from "@/components/contacts-grid";
import { ContactNouveau } from "@/components/contact-nouveau";
import { AgendaRdvs } from "@/components/agenda-rdvs";

export const dynamic = "force-dynamic";

export default async function AgendaPage() {
  const { connecte, rdvs, contacts } = await getAgenda();

  return (
    <>
      <PageHeader titre="Agenda & Clients" sous="Rendez-vous et carnet de contacts" actif={connecte} />

      <Card>
        <CardHeader titre="Rendez-vous" compteur={rdvs.length} />
        <AgendaRdvs rdvs={rdvs} />
      </Card>

      <Card>
        <div className="mb-3.5 flex items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5">
            <h3 className="text-[0.8rem] font-semibold uppercase tracking-[0.06em] text-muted">Répertoire de contacts</h3>
            <span className="font-num text-[0.8rem] text-faint">{contacts.length}</span>
          </div>
          <ContactNouveau />
        </div>
        {contacts.length === 0 ? (
          <Empty icon={Users}>Aucun contact synchronisé. Ton répertoire Discord (alliés, clients, indics…) s&apos;affichera ici — ou ajoute-en un avec « Nouveau contact ».</Empty>
        ) : (
          <>
            <p className="mb-3 text-[0.76rem] text-faint">Clique sur un contact pour voir sa fiche complète.</p>
            <ContactsGrid contacts={contacts} />
          </>
        )}
      </Card>
    </>
  );
}
