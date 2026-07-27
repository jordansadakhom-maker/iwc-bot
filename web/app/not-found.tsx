import Link from "next/link";

export const metadata = { title: "Page introuvable — Iron Wolf Company" };

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center px-5 py-10" style={{ background: "radial-gradient(1000px 520px at 50% -10%, color-mix(in srgb,var(--accent) 12%,transparent), transparent 62%), var(--bg)" }}>
      <div className="w-full max-w-[440px] text-center">
        <div className="font-num text-[3.2rem] font-bold leading-none" style={{ color: "var(--accent)" }}>404</div>
        <h1 className="mt-3 font-display text-2xl tracking-[0.08em]">Piste perdue</h1>
        <p className="mx-auto mt-2 max-w-[340px] text-[0.88rem] leading-relaxed text-muted">
          Cette page n&apos;existe pas ou a été déplacée. Reviens sur la bonne route.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5">
          <Link href="/" className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-[0.85rem] font-semibold text-black/85" style={{ background: "linear-gradient(180deg,var(--accent-hi),var(--accent))" }}>
            Retour à l&apos;accueil
          </Link>
          <Link href="/rejoindre" className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2.5 text-[0.85rem] font-semibold text-muted hover:text-ink">
            Rejoindre la compagnie
          </Link>
        </div>
      </div>
    </main>
  );
}
