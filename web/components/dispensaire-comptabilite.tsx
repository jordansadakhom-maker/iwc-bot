import { Landmark, TrendingUp, TrendingDown, Wallet, Lock, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { money } from "@/lib/dispensaire-facturation-const";
import { Cartouche } from "@/components/dispensaire-ui";
import type { ComptabiliteData } from "@/lib/dispensaire-comptabilite";

const dateFR = (s: string) => { try { return new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "short", year: "2-digit" }).format(new Date(s)); } catch { return "—"; } };

export function DispensaireComptabilite({ data }: { data: ComptabiliteData }) {
  if (!data.canVoir) return (
    <div className="rounded-[14px] border border-border bg-surface p-8 text-center">
      <Lock className="mx-auto h-6 w-6 text-faint" />
      <p className="mt-2 text-[0.9rem] text-muted">La comptabilité est réservée aux membres habilités (droit facturation).</p>
    </div>
  );

  const maxSrc = Math.max(1, ...data.parSource.map((s) => s.montant));

  return (
    <div className="flex flex-col gap-4">
      {/* Synthèse */}
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <Cartouche label="Trésorerie" valeur={money(data.tresorerie)} ton={data.tresorerie >= 0 ? "var(--good)" : "var(--oxblood)"} icon={Wallet} />
        <Cartouche label="Recettes (total)" valeur={money(data.recettesTotal)} ton="var(--good)" icon={TrendingUp} />
        <Cartouche label="Dépenses (total)" valeur={money(data.depensesTotal)} ton="var(--oxblood)" icon={TrendingDown} />
        <Cartouche label={`Solde · ${data.moisLabel}`} valeur={money(data.moisSolde)} ton={data.moisSolde >= 0 ? "var(--good)" : "var(--oxblood)"} icon={Landmark} />
      </div>

      {/* Répartition par source */}
      <section className="rounded-[14px] border border-border bg-surface p-4">
        <h3 className="mb-3 flex items-center gap-2 text-[0.9rem] font-semibold"><Landmark className="h-4 w-4 text-accent" /> Répartition par source</h3>
        {data.parSource.length === 0 ? (
          <p className="py-4 text-center text-[0.82rem] italic text-faint">Aucun flux financier enregistré.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {data.parSource.map((s) => {
              const ton = s.type === "recette" ? "var(--good)" : "var(--oxblood)";
              return (
                <div key={s.label + s.type} className="flex items-center gap-3">
                  <span className="w-28 shrink-0 text-[0.82rem] text-muted">{s.label}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full" style={{ background: "var(--surface-2)" }}>
                    <div className="h-full rounded-full" style={{ width: `${Math.max(3, (s.montant / maxSrc) * 100)}%`, background: ton }} />
                  </div>
                  <span className="w-24 shrink-0 text-right font-num text-[0.84rem] font-semibold" style={{ color: ton }}>{s.type === "recette" ? "+" : "−"}{money(s.montant)}</span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Grand-livre */}
      <section className="rounded-[14px] border border-border bg-surface p-4">
        <h3 className="mb-3 flex items-center gap-2 text-[0.9rem] font-semibold"><Wallet className="h-4 w-4 text-accent" /> Grand-livre <span className="font-num text-[0.8rem] text-faint">{data.ecritures.length}</span></h3>
        {data.ecritures.length === 0 ? (
          <p className="py-6 text-center text-[0.82rem] italic text-faint">Le grand-livre est encore vide.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-[0.82rem]">
              <thead>
                <tr className="border-b border-border text-[0.66rem] uppercase tracking-[0.04em] text-faint">
                  <th className="py-1.5 pr-2 font-semibold">Date</th>
                  <th className="px-2 py-1.5 font-semibold">Libellé</th>
                  <th className="px-2 py-1.5 font-semibold">Catégorie</th>
                  <th className="px-2 py-1.5 text-right font-semibold">Montant</th>
                </tr>
              </thead>
              <tbody>
                {data.ecritures.map((e) => {
                  const ton = e.type === "recette" ? "var(--good)" : "var(--oxblood)";
                  const Ic = e.type === "recette" ? ArrowUpRight : ArrowDownRight;
                  return (
                    <tr key={e.id} className="border-b border-border/60">
                      <td className="py-2 pr-2 font-num text-faint">{dateFR(e.date)}</td>
                      <td className="px-2 py-2"><span className="line-clamp-1">{e.libelle}</span></td>
                      <td className="px-2 py-2 text-muted">{e.categorie}</td>
                      <td className="px-2 py-2 text-right"><span className="inline-flex items-center gap-1 font-num font-semibold" style={{ color: ton }}><Ic className="h-3.5 w-3.5" />{e.type === "recette" ? "+" : "−"}{money(e.montant)}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
