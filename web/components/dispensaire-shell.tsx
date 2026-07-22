"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, Cross, Search, Bell } from "lucide-react";
import { DISP_NAV, DISP_EXTRA } from "@/lib/dispensaire-nav";
import { RegistreHeader } from "@/components/dispensaire-ui";
import { LogoutButton } from "@/components/logout-button";

// Coquille de la section « Dispensaire de Saint-Denis » : en-tête registre 1904
// + barre d'onglets horizontale (responsive). Séparée de la coquille Iron Wolf.
export function DispensaireShell({ children, habilite = false, estAdmin = false, notifCount = 0, standalone = false, dateline }: { children: React.ReactNode; habilite?: boolean; estAdmin?: boolean; notifCount?: number; standalone?: boolean; dateline?: string }) {
  const path = usePathname();
  // En mode autonome, on masque l'onglet Répertoire (page hébergée par la coquille
  // Iron Wolf) pour ne laisser aucune trace de l'autre plateforme.
  const tabs = DISP_NAV.filter((t) => (!t.restreint || habilite) && (!t.admin || estAdmin) && !(standalone && t.href === "/repertoire"));
  const estActif = (href: string) => (href === "/dispensaire" ? path === "/dispensaire" : path.startsWith(href));

  // En-tête de folio de la page courante : correspondance la plus précise dans la
  // barre d'onglets (préfixe le plus long), sinon table des routes annexes.
  const folioFor = (() => {
    if (path === "/dispensaire") return { titre: DISP_NAV[0].label, sous: DISP_NAV[0].desc, folio: "Fol. 01" };
    const match = DISP_NAV
      .map((t, i) => ({ t, i }))
      .filter(({ t }) => t.href !== "/dispensaire" && path.startsWith(t.href))
      .sort((a, b) => b.t.href.length - a.t.href.length)[0];
    if (match) return { titre: match.t.label, sous: match.t.desc, folio: `Fol. ${String(match.i + 1).padStart(2, "0")}` };
    const extraKey = Object.keys(DISP_EXTRA).find((k) => path.startsWith(k));
    if (extraKey) return { titre: DISP_EXTRA[extraKey].label, sous: DISP_EXTRA[extraKey].desc, folio: undefined };
    return null;
  })();

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
          <div className="flex shrink-0 items-center gap-1.5">
            <Link href="/dispensaire/recherche" title="Recherche globale" className="grid h-8 w-8 place-items-center rounded-lg border border-border bg-surface-2 text-muted transition hover:border-border-2 hover:text-ink">
              <Search className="h-4 w-4" />
            </Link>
            <Link href="/dispensaire/notifications" title="Notifications" className="relative grid h-8 w-8 place-items-center rounded-lg border border-border bg-surface-2 text-muted transition hover:border-border-2 hover:text-ink">
              <Bell className="h-4 w-4" />
              {notifCount > 0 ? <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full px-1 text-[0.58rem] font-bold text-white" style={{ background: "var(--oxblood)" }}>{notifCount > 9 ? "9+" : notifCount}</span> : null}
            </Link>
            {standalone ? (
              <LogoutButton />
            ) : (
              <Link href="/dashboard" className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-[0.74rem] font-semibold text-muted transition hover:border-border-2 hover:text-ink">
                <ArrowLeft className="h-3.5 w-3.5" /> Iron Wolf
              </Link>
            )}
          </div>
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

        <main className="mt-5 pb-16">
          {folioFor ? <RegistreHeader titre={folioFor.titre} sous={folioFor.sous} folio={folioFor.folio} dateline={dateline} /> : null}
          {children}
        </main>
      </div>
    </div>
  );
}
