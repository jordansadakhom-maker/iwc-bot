import { CalendarDays, Users } from "lucide-react";
import { getAgenda } from "@/lib/queries";
import { PageHeader, Card, CardHeader, Empty, Badge } from "@/components/ui";
import { ContactsGrid } from "@/components/contacts-grid";
import { ContactNouveau } from "@/components/contact-nouveau";
import { AgendaLieuPhoto } from "@/components/agenda-lieu-photo";

export const dynamic = "force-dynamic";

const RDV_TONE: Record<string, "good" | "warn" | "muted" | "accent"> = {
  planifié: "warn", planifie: "warn", nouveau: "warn", transmis: "accent", confirmé: "accent", confirme: "accent",
  honoré: "good", honore: "good", lapin: "muted", annulé: "muted", annule: "muted", décliné: "muted", decline: "muted",
};

function Stars({ n }: { n: number }) {
  const v = Math.max(0, Math.min(5, Math.round(n)));
  if (v === 0) return <span className="text-faint">—</span>;
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`Fiabilité ${v}/5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className="h-1.5 w-2.5 rounded-sm" style={{ background: i <= v ? "var(--accent)" : "color-mix(in srgb,var(--ink) 12%,transparent)" }} />
      ))}
    </span>
  );
}

export default async function AgendaPage() {
  const { connecte, rdvs, contacts } = await getAgenda();

  return (
    <>
      <PageHeader titre="Agenda & Clients" sous="Rendez-vous et carnet de contacts" actif={connecte} />

      <Card>
        <CardHeader titre="Rendez-vous" compteur={rdvs.length} />
        {rdvs.length === 0 ? (
          <Empty icon={CalendarDays}>
            Aucun rendez-vous pour l&apos;instant. Les demandes (Discord et site public) apparaîtront ici.
          </Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] border-collapse text-left text-[0.85rem]">
              <thead>
                <tr className="text-[0.7rem] uppercase tracking-[0.06em] text-faint">
                  <th className="border-b border-border px-2.5 py-2 font-semibold">Client</th>
                  <th className="border-b border-border px-2.5 py-2 font-semibold">Prestation</th>
                  <th className="border-b border-border px-2.5 py-2 font-semibold">Lieu</th>
                  <th className="border-b border-border px-2.5 py-2 font-semibold">Créneau</th>
                  <th className="border-b border-border px-2.5 py-2 font-semibold">Statut</th>
                  <th className="border-b border-border px-2.5 py-2 font-semibold">Lieu (photo)</th>
                </tr>
              </thead>
              <tbody>
                {rdvs.map((r) => (
                  <tr key={r.id} className="hover:bg-[color-mix(in_srgb,var(--ink)_4%,transparent)]">
                    <td className="border-b border-border px-2.5 py-2.5 font-medium">
                      {r.nomRP || "—"}
                      {r.source === "web" ? <span className="ml-1.5 align-middle"><Badge tone="accent">web</Badge></span> : null}
                    </td>
                    <td className="border-b border-border px-2.5 py-2.5 text-muted">{r.type || "—"}</td>
                    <td className="border-b border-border px-2.5 py-2.5 text-muted">{r.lieu || "—"}</td>
                    <td className="border-b border-border px-2.5 py-2.5 text-muted">
                      {r.creneau || "—"}
                      {r.duree ? <span className="block text-[0.72rem] text-faint">⏳ {r.duree}</span> : null}
                    </td>
                    <td className="border-b border-border px-2.5 py-2.5"><Badge tone={RDV_TONE[r.statut?.toLowerCase()] ?? "muted"}>{r.statut}</Badge></td>
                    <td className="border-b border-border px-2.5 py-2.5"><AgendaLieuPhoto id={r.id} lieuPhoto={r.lieuPhoto} lieu={r.lieu} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
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
