import { TrendingDown, PackageMinus } from "lucide-react";
import type { PrevisionData, Urgence } from "@/lib/dispensaire-prevision";

const dateFR = (s: string | null) => { if (!s) return "—"; try { return new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "short" }).format(new Date(s)); } catch { return "—"; } };
const TON: Record<Urgence, string> = { rupture: "var(--oxblood)", critique: "var(--oxblood)", bientot: "var(--warn)", surveiller: "var(--accent)" };
const LABEL: Record<Urgence, string> = { rupture: "En rupture", critique: "Critique", bientot: "Bientôt", surveiller: "À surveiller" };

export function DispensairePrevisions({ data }: { data: PrevisionData }) {
  return (
    <section className="rounded-[14px] border border-border bg-surface p-4">
      <div className="mb-1 flex items-center gap-2">
        <h3 className="flex items-center gap-2 text-[0.9rem] font-semibold"><TrendingDown className="h-4 w-4 text-accent" /> Prévisions de rupture</h3>
        {data.pret ? <span className="font-num text-[0.8rem] text-faint">{data.items.length}</span> : null}
      </div>
      <p className="mb-3 text-[0.76rem] text-muted">Estimation fondée sur la consommation réelle des {data.fenetreJours} derniers jours — vitesse d&apos;écoulement, date de rupture probable et quantité à commander.</p>

      {!data.pret ? (
        <p className="py-4 text-center text-[0.82rem] italic text-faint">Données indisponibles.</p>
      ) : data.items.length === 0 ? (
        <p className="py-6 text-center text-[0.82rem] italic text-faint">Aucune rupture prévue à l&apos;horizon — les stocks suivent la consommation.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-[0.82rem]">
            <thead>
              <tr className="border-b border-border text-[0.66rem] uppercase tracking-[0.04em] text-faint">
                <th className="py-1.5 pr-2 font-semibold">Article</th>
                <th className="px-2 py-1.5 font-semibold">Stock</th>
                <th className="px-2 py-1.5 font-semibold">Conso./j</th>
                <th className="px-2 py-1.5 font-semibold">Rupture dans</th>
                <th className="px-2 py-1.5 font-semibold">Date est.</th>
                <th className="px-2 py-1.5 text-right font-semibold">À commander</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((p) => (
                <tr key={p.id} className="border-b border-border/60">
                  <td className="py-2 pr-2">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: TON[p.urgence] }} title={LABEL[p.urgence]} />
                      <span className="font-semibold">{p.nom}</span>
                      {p.coffre ? <span className="text-[0.72rem] text-faint">· {p.coffre}</span> : null}
                    </div>
                  </td>
                  <td className="px-2 py-2 font-num">{p.stock}{p.unite ? ` ${p.unite}` : ""}</td>
                  <td className="px-2 py-2 font-num text-muted">{p.consoJour}</td>
                  <td className="px-2 py-2 font-num font-semibold" style={{ color: TON[p.urgence] }}>{p.joursRestants == null ? "épuisé" : p.joursRestants <= 0 ? "aujourd'hui" : `${p.joursRestants} j`}</td>
                  <td className="px-2 py-2 font-num text-faint">{dateFR(p.dateRupture)}</td>
                  <td className="px-2 py-2 text-right">
                    {p.recommande > 0 ? <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-num text-[0.78rem] font-semibold" style={{ color: "var(--accent)", background: "color-mix(in srgb,var(--accent) 12%,transparent)" }}><PackageMinus className="h-3 w-3" /> +{p.recommande}</span> : <span className="text-faint">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
