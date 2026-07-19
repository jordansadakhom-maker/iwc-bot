import { RejoindreForm } from "./rejoindre-form";
import { PublicNav } from "@/components/public-nav";

// Page PUBLIQUE : rejoindre la Iron Wolf Company (candidature sans connexion).
// Exemptée du verrouillage REQUIRE_AUTH via le middleware.
export const metadata = {
  title: "Rejoindre la compagnie — Iron Wolf Company",
  description: "Postule pour rejoindre la Iron Wolf Company : sécurité, escorte, armement, chasse de prime. Dépose ta candidature, on te recontacte.",
};

function Crest() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-9 w-9" aria-hidden>
      <path d="M12 2 8.5 5H5l-.7 3.4L2 10l1.6 2.2L3 15l2.7 1 .8 3 3-1.2L12 21l1.5-3.2 3 1.2.8-3 2.7-1-.6-2.8L22 10l-2.3-1.6L19 5h-3.5L12 2Zm0 5.5 1.8 1.6L12 11l-1.8-1.9L12 7.5Z" />
    </svg>
  );
}

export default function RejoindrePage() {
  return (
    <main className="grid min-h-screen place-items-center px-5 py-10" style={{ background: "radial-gradient(1000px 520px at 50% -10%, color-mix(in srgb,var(--accent) 12%,transparent), transparent 62%), var(--bg)" }}>
      <div className="w-full max-w-[520px]">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-4 grid h-16 w-16 place-items-center rounded-2xl border border-border-2 text-accent" style={{ background: "radial-gradient(circle at 30% 25%, color-mix(in srgb,var(--accent) 30%,transparent), transparent 70%), var(--surface)" }}>
            <Crest />
          </div>
          <h1 className="font-display text-2xl tracking-[0.1em]">REJOINDRE LA MEUTE</h1>
          <p className="mt-2 max-w-[380px] text-[0.86rem] leading-relaxed text-muted">
            La Iron Wolf Company recrute. Sécurité, escorte, armement, chasse de prime — si tu as du cœur au ventre, dépose ta candidature, on te recontacte.
          </p>
        </div>

        <PublicNav active="rejoindre" />

        <section className="rounded-2xl border border-border bg-surface p-5 shadow-card sm:p-6" style={{ background: "linear-gradient(180deg,var(--surface),color-mix(in srgb,var(--surface) 88%,#000))" }}>
          <h2 className="mb-4 text-center font-display text-lg">Formulaire de candidature</h2>
          <RejoindreForm />
        </section>
      </div>
    </main>
  );
}
