import { Users } from "lucide-react";
import { getMembres } from "@/lib/queries";
import { PageHeader, Card, CardHeader, Empty, Badge } from "@/components/ui";

export const dynamic = "force-dynamic";

const STATUT_TONE: Record<string, "good" | "warn" | "muted"> = {
  actif: "good", absent: "warn", inactif: "muted", parti: "muted", visiteur: "muted",
};

function initiales(nom: string) {
  return nom.split(/\s+/).filter(Boolean).map((s) => s[0]).slice(0, 2).join("").toUpperCase() || "?";
}

export default async function MembresPage() {
  const { connecte, membres } = await getMembres();
  const iwc = membres.filter((m) => m.pole !== "illegal");
  const conf = membres.filter((m) => m.pole === "illegal");

  function Bloc({ titre, tone, list }: { titre: string; tone: "accent" | "oxblood"; list: typeof membres }) {
    return (
      <Card>
        <CardHeader titre={titre} compteur={list.length} />
        {list.length === 0 ? (
          <Empty icon={Users}>Aucun membre synchronisé dans ce pôle pour l&apos;instant.</Empty>
        ) : (
          <div className="flex flex-col divide-y divide-border">
            {list.map((m) => (
              <div key={m.id} className="flex items-center gap-3 py-2.5">
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[0.72rem] font-extrabold text-black/85" style={{ background: tone === "oxblood" ? "linear-gradient(135deg,var(--oxblood),#000)" : "linear-gradient(135deg,var(--accent),color-mix(in srgb,var(--accent) 30%,#000))" }}>
                  {initiales(m.nomIC)}
                </div>
                <div className="min-w-0">
                  <div className="truncate text-[0.9rem] font-semibold">{m.nomIC}</div>
                  <div className="truncate text-[0.74rem] text-muted">{m.grade || "—"}</div>
                </div>
                <span className="ml-auto"><Badge tone={STATUT_TONE[m.statut?.toLowerCase()] ?? "muted"}>{m.statut}</Badge></span>
              </div>
            ))}
          </div>
        )}
      </Card>
    );
  }

  return (
    <>
      <PageHeader titre="Membres & RH" sous={connecte ? `${membres.length} membre(s) synchronisé(s) depuis Discord` : "Synchronisé avec ton serveur Discord"} actif={connecte} />
      {membres.length === 0 ? (
        <Card>
          <Empty icon={Users}>
            Aucun membre synchronisé pour l&apos;instant. La meute apparaîtra ici automatiquement dès que le bot pousse ses données.
          </Empty>
        </Card>
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-2">
          <Bloc titre="Iron Wolf Company" tone="accent" list={iwc} />
          <Bloc titre="La Confrérie" tone="oxblood" list={conf} />
        </div>
      )}
    </>
  );
}
