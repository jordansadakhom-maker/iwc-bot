"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LayoutDashboard, Users, Car, Radio, ScrollText, Settings, Shield, LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Item = { href: string; label: string; icon: typeof LayoutDashboard; pret: boolean };
const ITEMS: Item[] = [
  { href: "/dashboard", label: "Tableau de bord", icon: LayoutDashboard, pret: true },
  { href: "/agents", label: "Agents", icon: Users, pret: true },
  { href: "/patrouilles", label: "Patrouilles", icon: Car, pret: true },
  { href: "/dispatch", label: "Dispatch", icon: Radio, pret: false },
  { href: "/audit", label: "Journal d'audit", icon: ScrollText, pret: false },
  { href: "/admin", label: "Administration", icon: Settings, pret: false },
];

export function Shell({ children, nomAgent, gradeNom, allowed }: { children: React.ReactNode; nomAgent: string; gradeNom: string | null; allowed: string[] }) {
  const path = usePathname();
  const router = useRouter();

  async function deconnexion() {
    try { await createClient().auth.signOut(); } catch { /* session déjà close */ }
    router.push("/login");
    router.refresh();
  }

  const visibles = ITEMS.filter((it) => allowed.includes(it.href));

  return (
    <div className="min-h-screen bg-bg">
      <header className="sticky top-0 z-30 border-b border-border bg-bg-2/95 backdrop-blur"
        style={{ paddingTop: "env(safe-area-inset-top,0px)" }}>
        <div className="mx-auto flex max-w-[1180px] items-center gap-3 px-4 py-2.5">
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-md" style={{ background: "color-mix(in srgb,var(--navy) 22%,transparent)" }}>
              <Shield className="h-4 w-4 text-navy-hi" />
            </span>
            <div className="leading-tight">
              <div className="font-display text-[0.98rem] font-bold uppercase tracking-[0.08em] text-ink">LSPD</div>
              <div className="text-[0.6rem] uppercase tracking-[0.12em] text-faint">Los Santos Police Dept.</div>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <div className="text-[0.82rem] font-semibold text-ink">{nomAgent}</div>
              <div className="text-[0.66rem] uppercase tracking-[0.05em] text-faint">{gradeNom || "Sans grade"}</div>
            </div>
            <button onClick={deconnexion} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[0.76rem] font-semibold text-muted transition hover:text-ink" aria-label="Se déconnecter">
              <LogOut className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Déconnexion</span>
            </button>
          </div>
        </div>
        <nav className="mx-auto flex max-w-[1180px] gap-1 overflow-x-auto px-3 pb-1.5">
          {visibles.map((it) => {
            const actif = path === it.href || path.startsWith(it.href + "/");
            const Icon = it.icon;
            if (!it.pret) {
              return (
                <span key={it.href} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[0.78rem] font-medium text-faint" title="Module en préparation">
                  <Icon className="h-3.5 w-3.5" /> {it.label}
                  <span className="rounded-full border border-border px-1.5 py-px text-[0.56rem] uppercase tracking-[0.05em]">bientôt</span>
                </span>
              );
            }
            return (
              <Link key={it.href} href={it.href}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[0.78rem] font-semibold transition"
                style={actif ? { background: "color-mix(in srgb,var(--navy) 20%,transparent)", color: "var(--navy-hi)" } : { color: "var(--muted)" }}>
                <Icon className="h-3.5 w-3.5" /> {it.label}
              </Link>
            );
          })}
        </nav>
      </header>
      <main className="mx-auto max-w-[1180px] px-4 py-5"
        style={{ paddingLeft: "max(16px, env(safe-area-inset-left,0px))", paddingRight: "max(16px, env(safe-area-inset-right,0px))" }}>
        {children}
      </main>
    </div>
  );
}
