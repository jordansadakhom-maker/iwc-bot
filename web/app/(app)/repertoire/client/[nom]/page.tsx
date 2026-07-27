import Link from "next/link";
import { ArrowLeft, AlertTriangle, Eye, StickyNote } from "lucide-react";
import { getFicheClient } from "@/app/(app)/finances/actions";
import { PageHeader, Card } from "@/components/ui";

export const dynamic = "force-dynamic";

const ICONE: Record<string, string> = { Vente: "🔫", Contrat: "📜", "Rendez-vous": "📅", Facture: "🧾", "Télégramme": "✉️" };
const money = (n: number) => `$${Math.round(n).toLocaleString("fr-FR")}`;
const dateFR = (s: string) => { if (!s) return ""; try { return new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "short", year: "numeric" }).format(new Date(s)); } catch { return ""; } };

export default async function FicheClientPage({ params }: { params: Promise<{ nom: string }> }) {
  const { nom } = await params;
  const cible = decodeURIComponent(nom);
  const f = await getFicheClient(cible);

  const interdit = f.statut === "interdit";
  const surveille = f.statut === "surveillance";

  return (
    <>
      <PageHeader titre={`Fiche client — ${f.nom}`} sous="Vue 360° : ventes, contrats, rendez-vous, factures & télégrammes — dérivée à la lecture" actif />
      <div className="mb-2">
        <Link href="/repertoire" className="inline-flex items-center gap-1.5 text-[0.8rem] text-muted transition hover:text-ink"><ArrowLeft className="h-3.5 w-3.5" /> Répertoire</Link>
      </div>

      {/* Bandeau d'alerte sécurité */}
      {interdit || surveille ? (
        <div className="mb-3 flex items-center gap-2 rounded-[12px] border px-3.5 py-2.5 text-[0.86rem] font-semibold" style={interdit ? { color: "var(--oxblood)", borderColor: "color-mix(in srgb,var(--oxblood) 45%,var(--border))", background: "color-mix(in srgb,var(--oxblood) 9%,transparent)" } : { color: "var(--warn)", borderColor: "color-mix(in srgb,var(--warn) 45%,var(--border))", background: "color-mix(in srgb,var(--warn) 9%,transparent)" }}>
          {interdit ? <AlertTriangle className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          {interdit ? "Client INTERDIT (blacklist) — ne pas servir sans validation." : "Client sous surveillance — prudence."}
        </div>
      ) : null}

      <Card>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-[1.15rem] font-semibold">{f.nom}</div>
            {f.contact ? <div className="mt-0.5 text-[0.78rem] text-faint">Contact : {f.contact}</div> : null}
          </div>
          <div className="flex gap-4 text-right">
            <div><div className="font-num text-[1.3rem] font-bold">{money(f.totalDepense)}</div><div className="text-[0.7rem] text-faint">Total dépensé</div></div>
            <div><div className="font-num text-[1.3rem] font-bold">{f.nbActes}</div><div className="text-[0.7rem] text-faint">Actes</div></div>
          </div>
        </div>
        {f.notes ? (
          <div className="mt-3 flex items-start gap-2 rounded-[10px] border border-border bg-surface-2 px-3 py-2 text-[0.84rem]">
            <StickyNote className="mt-0.5 h-3.5 w-3.5 shrink-0 text-faint" />
            <span className="text-muted">{f.notes}</span>
          </div>
        ) : null}
      </Card>

      <Card>
        <div className="mb-2 text-[0.8rem] font-semibold uppercase tracking-[0.06em] text-muted">Historique chronologique</div>
        {f.actes.length === 0 ? (
          <p className="px-1 py-8 text-center text-[0.85rem] italic text-faint">Aucune activité enregistrée pour <b className="not-italic text-ink">{f.nom}</b>.</p>
        ) : (
          <div className="flex flex-col divide-y divide-border">
            {f.actes.map((a) => (
              <div key={a.id} className="flex items-start gap-3 py-2.5">
                <span className="mt-0.5 text-[1rem]" aria-hidden>{ICONE[a.type] || "•"}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-[0.7rem] font-semibold uppercase tracking-[0.05em]" style={{ color: "var(--accent)" }}>{a.type}</span>
                    <span className="text-[0.86rem]">{a.libelle}</span>
                  </div>
                  {a.statut ? <div className="mt-0.5 text-[0.72rem] text-faint">{a.statut}</div> : null}
                </div>
                <div className="shrink-0 text-right">
                  {a.montant != null ? <div className="font-num text-[0.86rem] font-semibold">{money(a.montant)}</div> : null}
                  <div className="text-[0.7rem] tabular-nums text-faint">{dateFR(a.date)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}
