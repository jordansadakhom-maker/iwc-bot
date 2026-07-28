import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getDemande } from "@/lib/demandes";
import { getSessionDiscordId } from "@/lib/queries";
import { PageHeader, Card, Empty } from "@/components/ui";
import { DemandeDetailVue } from "@/components/demande-detail";

export const dynamic = "force-dynamic";

export default async function DemandePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [demande, monId] = await Promise.all([getDemande(decodeURIComponent(id)), getSessionDiscordId()]);
  return (
    <>
      <PageHeader titre={demande ? demande.titre : "Demande"} sous={demande ? `${demande.ref} · ouvert par ${demande.auteurNom}` : "Dossier introuvable"} actif={!!demande} />
      <div className="mb-2">
        <Link href="/demandes" className="inline-flex items-center gap-1.5 text-[0.8rem] text-muted transition hover:text-ink"><ArrowLeft className="h-3.5 w-3.5" /> Toutes les demandes</Link>
      </div>
      {demande ? <DemandeDetailVue demande={demande} monId={monId} /> : <Card><Empty>Cette demande n&apos;existe pas ou a été supprimée.</Empty></Card>}
    </>
  );
}
