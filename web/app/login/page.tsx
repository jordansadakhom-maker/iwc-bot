import Link from "next/link";
import { Cross } from "lucide-react";
import { LoginButton } from "@/components/login-button";
import { isStandalone } from "@/lib/standalone-server";

// Écran de connexion — l'entrée de la plateforme. Le bouton lance la connexion
// Discord (OAuth Supabase). En mode autonome, l'écran est rebrandé Dispensaire.
export async function generateMetadata() {
  return { title: (await isStandalone()) ? "Connexion — Dispensaire de Saint-Denis" : "Connexion — IWC" };
}

function Crest() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-9 w-9" aria-hidden>
      <path d="M12 2 8.5 5H5l-.7 3.4L2 10l1.6 2.2L3 15l2.7 1 .8 3 3-1.2L12 21l1.5-3.2 3 1.2.8-3 2.7-1-.6-2.8L22 10l-2.3-1.6L19 5h-3.5L12 2Zm0 5.5 1.8 1.6L12 11l-1.8-1.9L12 7.5Z" />
    </svg>
  );
}

export default async function LoginPage() {
  const STANDALONE = await isStandalone();
  return (
    <main
      className="grid min-h-screen place-items-center px-5 py-10"
      style={{
        background:
          "radial-gradient(1000px 520px at 50% -10%, color-mix(in srgb,var(--accent) 12%,transparent), transparent 62%), var(--bg)",
      }}
    >
      <div className="w-full max-w-[420px]">
        <Link href={STANDALONE ? "/dispensaire" : "/"} className="mb-7 flex flex-col items-center text-center transition hover:opacity-90">
          <div
            className="mb-4 grid h-16 w-16 place-items-center rounded-2xl border border-border-2 text-accent"
            style={{ background: "radial-gradient(circle at 30% 25%, color-mix(in srgb,var(--accent) 30%,transparent), transparent 70%), var(--surface)" }}
          >
            {STANDALONE ? <Cross className="h-9 w-9" strokeWidth={2.2} /> : <Crest />}
          </div>
          {STANDALONE ? (
            <>
              <h1 className="font-display text-2xl tracking-[0.06em]">Dispensaire de Saint-Denis</h1>
              <p className="mt-1 text-[0.66rem] uppercase tracking-[0.22em] text-faint">Registre administratif · 1904</p>
            </>
          ) : (
            <>
              <h1 className="font-display text-2xl tracking-[0.1em]">IRON WOLF COMPANY</h1>
              <p className="mt-1 text-[0.66rem] uppercase tracking-[0.22em] text-faint">Poste de commandement</p>
            </>
          )}
        </Link>

        <section className="rounded-card border border-border bg-surface p-6 shadow-card" style={{ background: "linear-gradient(180deg,var(--surface),color-mix(in srgb,var(--surface) 88%,#000))" }}>
          <h2 className="text-center text-lg font-semibold">Connexion</h2>
          <p className="mx-auto mt-1.5 max-w-[300px] text-center text-[0.83rem] leading-relaxed text-muted">
            {STANDALONE
              ? "Identifie-toi avec ton compte Discord. Ton rôle au dispensaire est appliqué automatiquement."
              : "Identifie-toi avec ton compte Discord. Tes rôles et ton pôle sont récupérés automatiquement."}
          </p>

          <LoginButton />

          <p className="mt-4 text-center text-[0.72rem] text-faint">
            {STANDALONE ? "Accès réservé au personnel du dispensaire." : "Accès réservé aux membres de la Confrérie / Iron Wolf Company."}
          </p>
        </section>

        {!STANDALONE ? (
          <>
            <div className="mt-6 rounded-card border border-border bg-surface p-4 text-center">
              <p className="text-[0.82rem] text-muted">Tu es un client&nbsp;?</p>
              <Link href="/rendez-vous" className="mt-1 inline-block text-[0.88rem] font-semibold text-accent hover:underline">
                Prendre rendez-vous →
              </Link>
            </div>
            <p className="mt-6 text-center text-[0.78rem]">
              <Link href="/" className="font-semibold text-accent hover:underline">← Retour à l&apos;accueil (présentation)</Link>
            </p>
          </>
        ) : null}

        <p className="mt-6 text-center text-[0.72rem] text-faint">{STANDALONE ? "Dispensaire de Saint-Denis" : "Iron Wolf Company · Suivi confidentiel"}</p>
      </div>
    </main>
  );
}
