import { getArmurerie } from "@/lib/queries";
import { ArmureriePublic } from "@/components/armurerie-public";

// Page PUBLIQUE : GRILLE TARIFAIRE (lecture seule) de l'Armurerie de Van Horn.
// Sans connexion. Exemptée du verrouillage REQUIRE_AUTH via le middleware.
// Seuls les tarifs sont exposés — aucune donnée interne (coût, stock, clients,
// ventes, contrats, finances) n'est envoyée au navigateur.
export const dynamic = "force-dynamic";

// Catégories internes (matières de craft) exclues de la vitrine publique.
const CAT_INTERNES = new Set(["Composants", "Ressources"]);

export const metadata = {
  title: "Armurerie de Van Horn — Iron Wolf Company",
  description: "Grille tarifaire de l'Armurerie de Van Horn (Iron Wolf Company). Van Horn, État de Louisiane.",
  openGraph: {
    title: "Armurerie de Van Horn — Iron Wolf Company",
    description: "Grille tarifaire publique de l'armurerie. Van Horn, État de Louisiane.",
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
  const { connecte, produits } = await getArmurerie();
  // On ne transmet au client QUE la grille tarifaire minimale (aucune donnée interne).
  const tarifs = produits
    .filter((p) => !CAT_INTERNES.has(p.categorie))
    .map((p) => ({ nom: p.nom, categorie: p.categorie, prix: p.prix, dispo: !p.aLaDemande && p.stock > 0 }));

  return (
    <main className="min-h-screen px-5 py-10" style={{ background: "radial-gradient(1100px 560px at 50% -12%, color-mix(in srgb,var(--accent) 12%,transparent), transparent 62%), var(--bg)" }}>
      <div className="mx-auto w-full max-w-[900px]">
        <header className="mb-6 flex flex-col items-center text-center">
          <div className="mb-4 grid h-16 w-16 place-items-center rounded-2xl border border-border-2 text-accent" style={{ background: "radial-gradient(circle at 30% 25%, color-mix(in srgb,var(--accent) 30%,transparent), transparent 70%), var(--surface)" }}>
            <Crest />
          </div>
          <div className="text-[0.7rem] uppercase tracking-[0.3em] text-faint">Iron Wolf Company · État de Louisiane</div>
          <h1 className="mt-1 font-display text-3xl tracking-[0.06em]">Armurerie de Van Horn</h1>
          <p className="mt-2 max-w-[560px] text-[0.88rem] leading-relaxed text-muted">
            Grille tarifaire de l&apos;armurerie — armes, munitions et équipements. Consultable librement, sans connexion.
          </p>
        </header>

        {!connecte ? (
          <div className="rounded-2xl border border-border bg-surface p-8 text-center text-[0.9rem] text-muted">Armurerie momentanément indisponible.</div>
        ) : (
          <ArmureriePublic tarifs={tarifs} />
        )}

        <footer className="mt-8 text-center text-[0.72rem] text-faint">
          <p>Armurerie de Van Horn — tenue par l&apos;Iron Wolf Company. Vue publique en lecture seule.</p>
          <p className="mt-1">Pour une commande ou une prestation : <a href="/rendez-vous" className="text-accent hover:underline">prendre rendez-vous</a>.</p>
        </footer>
      </div>
    </main>
  );
}
