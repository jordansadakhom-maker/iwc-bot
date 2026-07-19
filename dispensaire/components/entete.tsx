import Link from "next/link";

export const ONGLETS = [
  { href: "/", label: "Accueil", pret: true },
  { href: "/stockage", label: "Stockage", pret: false },
  { href: "/facturation", label: "Facturation F.D.O.", pret: false },
  { href: "/repertoire", label: "Répertoire", pret: false },
  { href: "/rh", label: "Personnel", pret: false, prive: true },
  { href: "/certificats", label: "Certificats", pret: false },
  { href: "/documents", label: "Documents", pret: false },
  { href: "/ventes", label: "Ventes de bandages", pret: false },
  { href: "/factures", label: "Factures en retard", pret: false, prive: true },
];

export function Entete({ actif }: { actif: string }) {
  return (
    <header className="mb-6">
      <div className="cartouche rounded-[8px] bg-[var(--card)] px-6 py-5 text-center">
        <div className="text-[0.68rem] uppercase tracking-[0.35em] text-[var(--faint)]">État de Louisiane · Comté de Saint-Denis</div>
        <h1 className="font-display text-[2rem] leading-tight tracking-[0.02em] text-[var(--ink)] sm:text-[2.4rem]">Dispensaire de Saint-Denis</h1>
        <div className="mx-auto mt-1 flex max-w-[420px] items-center justify-center gap-3 text-[0.72rem] uppercase tracking-[0.2em] text-[var(--accent)]">
          <span className="h-px flex-1 bg-[var(--line)]" />Registre officiel · Anno 1904<span className="h-px flex-1 bg-[var(--line)]" />
        </div>
      </div>
      <nav className="mt-4 flex flex-wrap items-stretch gap-1.5">
        {ONGLETS.map((o) => {
          const on = o.href === actif;
          const base = "relative rounded-[6px] border px-3 py-1.5 text-[0.82rem] font-semibold transition";
          if (!o.pret) {
            return (
              <span key={o.href} className={`${base} cursor-default border-[var(--line)] bg-transparent text-[var(--faint)]`} title="Bientôt disponible">
                {o.prive ? "🔒 " : ""}{o.label}<span className="ml-1 text-[0.6rem] uppercase tracking-wide">· à venir</span>
              </span>
            );
          }
          return (
            <Link key={o.href} href={o.href} className={`${base} ${on ? "border-[var(--accent)] bg-[var(--accent)] text-[#f4ead6]" : "border-[var(--line)] bg-[var(--card)] text-[var(--ink)] hover:border-[var(--accent)]"}`}>
              {o.prive ? "🔒 " : ""}{o.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
