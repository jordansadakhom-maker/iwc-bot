import Link from "next/link";
import { chargerOffre } from "../actions";
import { SignContrat } from "@/components/sign-contrat";

export const dynamic = "force-dynamic";
export const metadata = { title: "Signer ton contrat — Iron Wolf Company" };

function Crest() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-9 w-9" aria-hidden>
      <path d="M12 2 8.5 5H5l-.7 3.4L2 10l1.6 2.2L3 15l2.7 1 .8 3 3-1.2L12 21l1.5-3.2 3 1.2.8-3 2.7-1-.6-2.8L22 10l-2.3-1.6L19 5h-3.5L12 2Zm0 5.5 1.8 1.6L12 11l-1.8-1.9L12 7.5Z" />
    </svg>
  );
}

export default async function SignatureContratPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const c = await chargerOffre(decodeURIComponent(token));

  return (
    <main className="grid min-h-screen place-items-center px-5 py-10" style={{ background: "radial-gradient(1000px 520px at 50% -10%, color-mix(in srgb,var(--accent) 12%,transparent), transparent 62%), var(--bg)" }}>
      <div className="w-full max-w-[480px]">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-4 grid h-16 w-16 place-items-center rounded-2xl border border-border-2 text-accent" style={{ background: "radial-gradient(circle at 30% 25%, color-mix(in srgb,var(--accent) 30%,transparent), transparent 70%), var(--surface)" }}>
            <Crest />
          </div>
          <h1 className="font-display text-2xl tracking-[0.1em]">IRON WOLF COMPANY</h1>
          <p className="mt-2 max-w-[340px] text-[0.86rem] leading-relaxed text-muted">Signature de ton contrat d&apos;opération.</p>
        </div>

        <section className="rounded-card border border-border bg-surface p-6 shadow-card" style={{ background: "linear-gradient(180deg,var(--surface),color-mix(in srgb,var(--surface) 88%,#000))" }}>
          {!c.trouve ? (
            <p className="py-4 text-center text-[0.86rem] text-muted">Lien invalide ou expiré. Demande un nouveau lien de signature à la Iron Wolf Company, ou écris-nous via la page <Link href="/telegramme" className="text-accent hover:underline">Télégramme</Link>.</p>
          ) : (
            <SignContrat token={decodeURIComponent(token)} offre={c.offre!} statutInitial={c.statut || "envoye"} />
          )}
        </section>

        <p className="mt-5 text-center text-[0.72rem] text-faint">Membre de la maison&nbsp;? <Link href="/login" className="text-accent hover:underline">Espace connecté</Link></p>
      </div>
    </main>
  );
}
