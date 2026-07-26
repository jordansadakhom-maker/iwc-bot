import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getCommunication } from "@/lib/queries";
import { PageHeader, Card } from "@/components/ui";
import { RdvManager } from "@/components/rdv-manager";

export const dynamic = "force-dynamic";

// Deep-link : /communication/rendez-vous/<id> — ouvre directement le rendez-vous
// ciblé (le gestionnaire pré-ouvre la modale du RDV correspondant).
export default async function RdvDeepLink({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const focusId = decodeURIComponent(id);
  const { connecte, rdvs, membres } = await getCommunication();
  const item = rdvs.find((r) => r.id === focusId);

  return (
    <>
      <PageHeader titre={item ? `Rendez-vous — ${item.nomRP || "Client"}` : "Rendez-vous"} sous="Demande ouverte depuis une notification" actif={connecte} />
      <div className="mb-2">
        <Link href="/communication#rdv-clients" className="inline-flex items-center gap-1.5 text-[0.8rem] text-muted transition hover:text-ink">
          <ArrowLeft className="h-3.5 w-3.5" /> Tous les rendez-vous
        </Link>
      </div>
      <Card>
        <RdvManager rdvs={rdvs} membres={membres} focusId={focusId} />
      </Card>
    </>
  );
}
