import Link from "next/link";

// Écran de connexion — l'entrée de la plateforme. Le bouton pointera vers la
// route d'authentification Discord OAuth (câblée dès que les clés Supabase +
// l'app Discord sont en place, Phase 1).
export const metadata = { title: "Connexion — IWC" };

function Crest() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-9 w-9" aria-hidden>
      <path d="M12 2 8.5 5H5l-.7 3.4L2 10l1.6 2.2L3 15l2.7 1 .8 3 3-1.2L12 21l1.5-3.2 3 1.2.8-3 2.7-1-.6-2.8L22 10l-2.3-1.6L19 5h-3.5L12 2Zm0 5.5 1.8 1.6L12 11l-1.8-1.9L12 7.5Z" />
    </svg>
  );
}

export default function LoginPage() {
  return (
    <main
      className="grid min-h-screen place-items-center px-5 py-10"
      style={{
        background:
          "radial-gradient(1000px 520px at 50% -10%, color-mix(in srgb,var(--accent) 12%,transparent), transparent 62%), var(--bg)",
      }}
    >
      <div className="w-full max-w-[420px]">
        <div className="mb-7 flex flex-col items-center text-center">
          <div
            className="mb-4 grid h-16 w-16 place-items-center rounded-2xl border border-border-2 text-accent"
            style={{ background: "radial-gradient(circle at 30% 25%, color-mix(in srgb,var(--accent) 30%,transparent), transparent 70%), var(--surface)" }}
          >
            <Crest />
          </div>
          <h1 className="font-display text-2xl tracking-[0.1em]">IRON WOLF COMPANY</h1>
          <p className="mt-1 text-[0.66rem] uppercase tracking-[0.22em] text-faint">Poste de commandement</p>
        </div>

        <section className="rounded-card border border-border bg-surface p-6 shadow-card" style={{ background: "linear-gradient(180deg,var(--surface),color-mix(in srgb,var(--surface) 88%,#000))" }}>
          <h2 className="text-center text-lg font-semibold">Connexion</h2>
          <p className="mx-auto mt-1.5 max-w-[300px] text-center text-[0.83rem] leading-relaxed text-muted">
            Identifie-toi avec ton compte Discord. Tes rôles et ton pôle sont récupérés automatiquement.
          </p>

          <Link
            href="/api/auth/discord"
            className="mt-6 flex w-full items-center justify-center gap-3 rounded-xl px-4 py-3 text-[0.95rem] font-semibold text-white transition hover:brightness-110"
            style={{ background: "#5865F2" }}
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5" aria-hidden>
              <path d="M20.3 4.4A19.8 19.8 0 0 0 15.4 3l-.3.5c1.6.4 2.9 1 4.2 1.8-1.6-.8-3.3-1.3-5.1-1.5a18.5 18.5 0 0 0-4.4 0C8.2 3.9 6.5 4.4 5 5.2 6.2 4.5 7.6 3.9 9.1 3.5L8.9 3A19.8 19.8 0 0 0 4 4.4C1.7 7.8.9 11.2 1.1 14.5a19.9 19.9 0 0 0 6 3l.8-1.1c-.9-.3-1.7-.7-2.5-1.2l.6-.4c3.3 1.5 6.9 1.5 10.2 0l.6.4c-.8.5-1.6.9-2.5 1.2l.8 1.1c2.2-.7 4.2-1.7 6-3 .3-3.8-.6-7.2-2.4-10.1ZM8.5 12.6c-.9 0-1.7-.9-1.7-1.9s.8-1.9 1.7-1.9 1.7.9 1.7 1.9-.7 1.9-1.7 1.9Zm7 0c-.9 0-1.7-.9-1.7-1.9s.8-1.9 1.7-1.9 1.7.9 1.7 1.9-.7 1.9-1.7 1.9Z" />
            </svg>
            Se connecter avec Discord
          </Link>

          <p className="mt-4 text-center text-[0.72rem] text-faint">
            Accès réservé aux membres de la Confrérie / Iron Wolf Company.
          </p>
        </section>

        <p className="mt-6 text-center text-[0.72rem] text-faint">Iron Wolf Company · Suivi confidentiel</p>
      </div>
    </main>
  );
}
