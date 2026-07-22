import { SuiviClient } from "@/components/suivi-client";

export const metadata = {
  title: "Suivre ma demande — Iron Wolf Company",
  description: "Suis tes rendez-vous et tes contrats avec la Iron Wolf Company. Entre ton nom pour voir où en est ta demande.",
};

function Crest() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-9 w-9" aria-hidden>
      <path d="M12 2 8.5 5H5l-.7 3.4L2 10l1.6 2.2L3 15l2.7 1 .8 3 3-1.2L12 21l1.5-3.2 3 1.2.8-3 2.7-1-.6-2.8L22 10l-2.3-1.6L19 5h-3.5L12 2Zm0 5.5 1.8 1.6L12 11l-1.8-1.9L12 7.5Z" />
    </svg>
  );
}

export default async function SuiviPage({ searchParams }: { searchParams: Promise<{ nom?: string }> }) {
  const sp = await searchParams;
  const initialNom = (sp?.nom || "").slice(0, 80);
  return (
    <main className="grid min-h-screen place-items-center px-5 py-10" style={{ background: "radial-gradient(1000px 520px at 50% -10%, color-mix(in srgb,var(--accent) 12%,transparent), transparent 62%), var(--bg)" }}>
      <div className="flex w-full max-w-[560px] flex-col items-center">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-4 grid h-16 w-16 place-items-center rounded-2xl border border-border-2 text-accent" style={{ background: "radial-gradient(circle at 30% 25%, color-mix(in srgb,var(--accent) 30%,transparent), transparent 70%), var(--surface)" }}>
            <Crest />
          </div>
          <h1 className="font-display text-2xl tracking-[0.08em]">SUIVRE MA DEMANDE</h1>
          <p className="mt-2 max-w-[420px] text-[0.86rem] leading-relaxed text-muted">
            Entre le nom que tu as donné à la compagnie pour voir où en sont tes <b className="text-ink">rendez-vous</b>, tes <b className="text-ink">contrats</b> et la <b className="text-ink">réponse à ton télégramme</b>.
          </p>
        </div>
        <SuiviClient />
        <p className="mt-6 text-[0.74rem] text-faint">
          Pas encore client ? <a href="/rendez-vous" className="font-semibold text-accent underline decoration-dotted underline-offset-2">Prendre rendez-vous</a> · <a href="/" className="hover:text-accent">Accueil</a>
        </p>
      </div>
    </main>
  );
}
