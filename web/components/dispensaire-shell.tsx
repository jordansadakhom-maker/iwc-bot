"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, Cross } from "lucide-react";
import { DISP_NAV } from "@/lib/dispensaire-nav";

// Coquille de la section « Dispensaire de Saint-Denis » : en-tête registre 1904
// + barre d'onglets horizontale (responsive). Séparée de la coquille Iron Wolf.
export function DispensaireShell({ children, habilite = false }: { children: React.ReactNode; habilite?: boolean }) {
  const path = usePathname();
  const tabs = DISP_NAV.filter((t) => !t.restreint || habilite);
  const estActif = (href: string) => (href === "/dispensaire" ? path === "/dispensaire" : path.startsWith(href));

  return (
    <div className="min-h-screen" style={{ background: "radial-gradient(1100px 500px at 50% -10%, color-mix(in srgb,var(--accent) 8%,transparent), transparent 60%)" }}>
      <div className="mx-auto max-w-[1180px] px-4 py-5">
        {/* En-tête registre */}
        <header className="flex items-start justify-between gap-3 border-b-2 pb-3" style={{ borderColor: "color-mix(in srgb,var(--accent) 45%,var(--border))" }}>
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-full border" style={{ borderColor: "color-mix(in srgb,var(--accent) 45%,var(--border))", background: "color-mix(in srgb,var(--accent) 10%,transparent)" }}>
              <Cross className="h-5 w-5 text-accent" strokeWidth={2.2} />
            </span>
            <div>
              <div className="font-display text-[1.5rem] leading-tight tracking-[0.02em]">Dispensaire de Saint-Denis</div>
              <div className="text-[0.76rem] italic text-faint">Registre administratif · Année 1904</div>
            </div>
          </div>
          <Link href="/dashboard" className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-[0.74rem] font-semibold text-muted transition hover:border-border-2 hover:text-ink">
            <ArrowLeft className="h-3.5 w-3.5" /> Iron Wolf
          </Link>
        </header>

        {/* Onglets */}
        <nav className="mt-3 flex gap-1 overflow-x-auto pb-1" style={{ scrollbarWidth: "thin" }}>
          {tabs.map((t) => {
            const Icon = t.icon;
            const on = estActif(t.href);
            if (!t.pret) return (
              <span key={t.href} title="Bientôt disponible" className="inline-flex shrink-0 cursor-not-allowed items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[0.78rem] font-semibold text-faint opacity-60">
                <Icon className="h-3.5 w-3.5" /> {t.label} <span className="rounded-full border border-border px-1.5 text-[0.6rem] uppercase">bientôt</span>
              </span>
            );
            return (
              <Link key={t.href} href={t.href} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[0.78rem] font-semibold transition"
                style={on ? { color: "#000", background: "var(--accent)" } : { color: "var(--muted)" }}>
                <Icon className="h-3.5 w-3.5" /> {t.label}
              </Link>
            );
          })}
        </nav>

        <main className="mt-5 pb-16">{children}</main>
      </div>
    </div>
  );
}
