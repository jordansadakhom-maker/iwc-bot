import { Eye, Crosshair } from "lucide-react";
import { getRenseignement } from "@/lib/queries";
import { PageHeader, Card, CardHeader, Empty, Badge } from "@/components/ui";

export const dynamic = "force-dynamic";

const STATUT_RAPPORT: Record<string, "good" | "warn" | "muted" | "accent"> = {
  nouveau: "warn", confirme: "good", confirmé: "good", verifie: "good", infirme: "muted", infirmé: "muted", archive: "muted", archivé: "muted",
};
const STATUT_TRAQUE: Record<string, "good" | "warn" | "oxblood" | "muted"> = {
  active: "oxblood", en_cours: "warn", capture: "good", capturé: "good", neutralise: "muted", neutralisé: "muted", cloture: "muted", clôturé: "muted",
};

// Fiabilité affichée sur 5 crans (échelle courante des sources RP).
function Fiabilite({ n }: { n: number }) {
  const v = Math.max(0, Math.min(5, Math.round(n)));
  return (
    <span className="inline-flex items-center gap-0.5" title={`Fiabilité ${v}/5`} aria-label={`Fiabilité ${v} sur 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className="h-1.5 w-3 rounded-sm" style={{ background: i <= v ? "var(--accent)" : "color-mix(in srgb,var(--ink) 12%,transparent)" }} />
      ))}
    </span>
  );
}

export default async function RenseignementPage() {
  const data = await getRenseignement();

  return (
    <>
      <PageHeader titre="Renseignement" sous="Rapports d'informateurs & personnes traquées" actif={data.connecte} />

      <div className="grid items-start gap-4 lg:grid-cols-[3fr_2fr]">
        <Card>
          <CardHeader titre="Rapports d'informateurs" compteur={data.rapports.length} />
          {data.rapports.length === 0 ? (
            <Empty icon={Eye}>
              Aucun rapport synchronisé pour l&apos;instant. Les renseignements remontés par tes informateurs sur Discord apparaîtront ici (source, cible, fiabilité, statut).
            </Empty>
          ) : (
            <div className="flex flex-col divide-y divide-border">
              {data.rapports.map((r) => (
                <div key={r.id} className="py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[0.9rem] font-semibold">
                        {r.cible ? <>Cible : {r.cible}</> : "Renseignement"}
                        {r.source ? <span className="ml-2 text-[0.74rem] font-normal text-muted">source : {r.source}</span> : null}
                      </div>
                      <p className="mt-1 text-[0.82rem] leading-relaxed text-muted">{r.info}</p>
                    </div>
                    <Badge tone={STATUT_RAPPORT[r.statut?.toLowerCase()] ?? "muted"}>{r.statut}</Badge>
                  </div>
                  <div className="mt-2 flex items-center gap-2 text-[0.72rem] text-faint">
                    <span>Fiabilité</span> <Fiabilite n={r.fiabilite} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <CardHeader titre="Personnes traquées" compteur={data.traques.length} />
          {data.traques.length === 0 ? (
            <Empty icon={Crosshair}>
              Aucune traque active. Les cibles et primes suivies sur Discord s&apos;afficheront ici.
            </Empty>
          ) : (
            <div className="flex flex-col gap-2.5">
              {data.traques.map((t) => (
                <div key={t.id} className="rounded-[11px] border border-border bg-surface-2 px-3 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[0.88rem] font-semibold">{t.cible}</div>
                    <Badge tone={STATUT_TRAQUE[t.statut?.toLowerCase()] ?? "muted"}>{t.statut}</Badge>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[0.72rem] text-muted">
                    {t.prime ? <span className="font-num rounded-md px-1.5 py-0.5" style={{ background: "color-mix(in srgb,var(--accent) 15%,transparent)", color: "var(--accent)" }}>Prime : {t.prime}</span> : null}
                    {t.dangerosite ? <span>Dangerosité : {t.dangerosite}</span> : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
