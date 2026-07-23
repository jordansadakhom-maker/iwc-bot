import { cents } from "@/lib/format";

// Vitrine PUBLIQUE de l'Armurerie de Van Horn — TARIFS UNIQUEMENT.
// Ne reçoit qu'une liste de tarifs minimale (nom, catégorie, prix, dispo) : aucune
// donnée interne (coût, stock, clients, ventes, contrats, finances) n'atteint le
// navigateur. Lecture seule, aucune action.

const money = (n: number) => `${cents(n)}$`;

export type TarifItem = { nom: string; categorie: string; prix: number; dispo: boolean };

function groupBy(arr: TarifItem[]): { nom: string; items: TarifItem[] }[] {
  const out: { nom: string; items: TarifItem[] }[] = [];
  for (const it of arr) { const k = it.categorie || "Divers"; let g = out.find((x) => x.nom === k); if (!g) { g = { nom: k, items: [] }; out.push(g); } g.items.push(it); }
  return out;
}

function Bloc({ titre, n, children }: { titre: string; n?: number; children: React.ReactNode }) {
  return (
    <section className="mb-4 overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <h2 className="font-display text-[1.02rem] tracking-[0.02em]">{titre}</h2>
        {n !== undefined ? <span className="text-[0.7rem] text-faint">{n}</span> : null}
      </div>
      {children}
    </section>
  );
}
const Vide = ({ children }: { children: React.ReactNode }) => <p className="px-4 py-6 text-center text-[0.86rem] italic text-faint">{children}</p>;

export function ArmureriePublic({ tarifs }: { tarifs: TarifItem[] }) {
  const cats = groupBy(tarifs);
  return (
    <div>
      <div className="mb-4 flex items-center justify-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-center text-[0.76rem] text-muted">
        📜 Grille tarifaire publique de l&apos;Armurerie de Van Horn.
      </div>

      {tarifs.length === 0 ? (
        <Bloc titre="Tarifs"><Vide>Catalogue en préparation.</Vide></Bloc>
      ) : (
        cats.map((c) => (
          <Bloc key={c.nom} titre={c.nom} n={c.items.length}>
            <ul className="divide-y divide-border">
              {c.items.map((p, i) => (
                <li key={c.nom + "-" + i} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="min-w-0 flex-1 truncate text-[0.9rem] font-medium">{p.nom}</span>
                  <span className="shrink-0 rounded-full px-2 py-0.5 text-[0.62rem] font-semibold uppercase tracking-[0.04em]" style={p.dispo ? { color: "var(--good)", background: "color-mix(in srgb,var(--good) 15%,transparent)" } : { color: "var(--muted)", background: "color-mix(in srgb,var(--ink) 8%,transparent)" }}>{p.dispo ? "En stock" : "Sur commande"}</span>
                  <span className="shrink-0 font-num text-[0.98rem] font-bold tabular-nums" style={{ color: p.prix > 0 ? "var(--accent)" : "var(--faint)" }}>{p.prix > 0 ? money(p.prix) : "Sur devis"}</span>
                </li>
              ))}
            </ul>
          </Bloc>
        ))
      )}
    </div>
  );
}
