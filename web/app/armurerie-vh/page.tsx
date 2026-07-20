import { getArmurerieBoutique } from "@/lib/queries";
import { cents } from "@/lib/format";

// Page PUBLIQUE : vitrine / tarifs de l'Armurerie de Van Horn (lecture seule,
// sans connexion). Exemptée du verrouillage REQUIRE_AUTH via le middleware.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Armurerie de Van Horn — Iron Wolf Company",
  description: "Tarifs officiels de l'Armurerie de Van Horn, tenue par l'Iron Wolf Company. Armes, munitions et équipement de l'État de Louisiane.",
  openGraph: {
    title: "Armurerie de Van Horn — Iron Wolf Company",
    description: "Tarifs officiels : armes, munitions et équipement. Van Horn, État de Louisiane.",
  },
};

function Crest() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-9 w-9" aria-hidden>
      <path d="M12 2 8.5 5H5l-.7 3.4L2 10l1.6 2.2L3 15l2.7 1 .8 3 3-1.2L12 21l1.5-3.2 3 1.2.8-3 2.7-1-.6-2.8L22 10l-2.3-1.6L19 5h-3.5L12 2Zm0 5.5 1.8 1.6L12 11l-1.8-1.9L12 7.5Z" />
    </svg>
  );
}

export default async function ArmurerieVanHornPage() {
  const { connecte, items } = await getArmurerieBoutique();

  // Regroupe par catégorie en conservant l'ordre d'arrivée (déjà trié).
  const categories: { nom: string; items: typeof items }[] = [];
  for (const it of items) {
    let g = categories.find((c) => c.nom === it.categorie);
    if (!g) { g = { nom: it.categorie, items: [] }; categories.push(g); }
    g.items.push(it);
  }

  return (
    <main className="min-h-screen px-5 py-10" style={{ background: "radial-gradient(1100px 560px at 50% -12%, color-mix(in srgb,var(--accent) 12%,transparent), transparent 62%), var(--bg)" }}>
      <div className="mx-auto w-full max-w-[860px]">
        {/* En-tête */}
        <header className="mb-7 flex flex-col items-center text-center">
          <div className="mb-4 grid h-16 w-16 place-items-center rounded-2xl border border-border-2 text-accent" style={{ background: "radial-gradient(circle at 30% 25%, color-mix(in srgb,var(--accent) 30%,transparent), transparent 70%), var(--surface)" }}>
            <Crest />
          </div>
          <div className="text-[0.7rem] uppercase tracking-[0.3em] text-faint">Iron Wolf Company · État de Louisiane</div>
          <h1 className="mt-1 font-display text-3xl tracking-[0.06em]">Armurerie de Van Horn</h1>
          <p className="mt-2 max-w-[520px] text-[0.88rem] leading-relaxed text-muted">
            Tarifs officiels de l&apos;armurerie. Armes, munitions et équipement — vente au comptoir de Van Horn, sur commande ou sur stock.
          </p>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2 text-[0.72rem]">
            <span className="rounded-full border border-border px-3 py-1 text-muted">{items.length} article{items.length > 1 ? "s" : ""} au catalogue</span>
            <span className="rounded-full border border-border px-3 py-1 text-faint">Prix en dollars ($)</span>
          </div>
        </header>

        {!connecte || items.length === 0 ? (
          <div className="rounded-2xl border border-border bg-surface p-8 text-center text-[0.9rem] text-muted">
            {connecte ? "Le catalogue est en cours de préparation. Revenez bientôt." : "Catalogue momentanément indisponible."}
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            {categories.map((cat) => (
              <section key={cat.nom} className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card" style={{ background: "linear-gradient(180deg,var(--surface),color-mix(in srgb,var(--surface) 90%,#000))" }}>
                <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
                  <h2 className="font-display text-[1.05rem] tracking-[0.03em]">{cat.nom}</h2>
                  <span className="text-[0.7rem] text-faint">{cat.items.length}</span>
                </div>
                <ul className="divide-y divide-border">
                  {cat.items.map((it, i) => (
                    <li key={cat.nom + i} className="flex items-center gap-3 px-4 py-2.5">
                      <span className="min-w-0 flex-1 truncate text-[0.9rem] font-medium">{it.nom}</span>
                      <span className="shrink-0 rounded-full px-2 py-0.5 text-[0.64rem] font-semibold uppercase tracking-[0.04em]" style={it.dispo === "stock" ? { color: "var(--good)", background: "color-mix(in srgb,var(--good) 15%,transparent)" } : { color: "var(--muted)", background: "color-mix(in srgb,var(--ink) 8%,transparent)" }}>
                        {it.dispo === "stock" ? "En stock" : "Sur commande"}
                      </span>
                      <span className="shrink-0 font-num text-[0.98rem] font-bold tabular-nums" style={{ color: it.prix > 0 ? "var(--accent)" : "var(--faint)" }}>
                        {it.prix > 0 ? `${cents(it.prix)}$` : "Sur devis"}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}

        <footer className="mt-8 text-center text-[0.72rem] text-faint">
          <p>Armurerie de Van Horn — tenue par l&apos;Iron Wolf Company. Tarifs indicatifs, susceptibles d&apos;évoluer.</p>
          <p className="mt-1">Pour une commande ou une prestation : <a href="/rendez-vous" className="text-accent hover:underline">prendre rendez-vous</a>.</p>
        </footer>
      </div>
    </main>
  );
}
