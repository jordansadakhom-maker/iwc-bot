"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Search, Bell, Menu } from "lucide-react";
import clsx from "clsx";
import { NAV, ME, type Pole } from "@/lib/data";
import { LogoutButton } from "@/components/logout-button";

type Profil = { nom: string; initiales: string; role: string; avatarUrl: string | null };

function Crest({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M12 2 8.5 5H5l-.7 3.4L2 10l1.6 2.2L3 15l2.7 1 .8 3 3-1.2L12 21l1.5-3.2 3 1.2.8-3 2.7-1-.6-2.8L22 10l-2.3-1.6L19 5h-3.5L12 2Zm0 5.5 1.8 1.6L12 11l-1.8-1.9L12 7.5Z" />
    </svg>
  );
}

export function Shell({ children, connecte = false, profil = null, initialPole = "iwc" }: { children: React.ReactNode; connecte?: boolean; profil?: Profil | null; initialPole?: Pole }) {
  const [pole, setPole] = useState<Pole>(initialPole);
  const me = profil ?? ME;
  const [open, setOpen] = useState(false);
  const path = usePathname();
  const router = useRouter();

  // Change de pôle : mémorise le choix dans un cookie puis rafraîchit les
  // données côté serveur (les pages relisent le cookie et filtrent par pôle).
  function choisirPole(p: Pole) {
    if (p === pole) return;
    setPole(p);
    document.cookie = `iwc_pole=${p === "confrerie" ? "confrerie" : "iwc"}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
  }

  return (
    <div data-pole={pole} className="min-h-screen grid grid-cols-1 lg:grid-cols-[264px_1fr]">
      {/* ============ SIDEBAR ============ */}
      <aside
        className={clsx(
          "z-40 flex flex-col gap-1.5 overflow-auto border-r border-border bg-bg-2 px-3.5 py-5",
          "fixed inset-y-0 left-0 w-[264px] transition-transform lg:sticky lg:top-0 lg:h-screen lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-[102%]"
        )}
      >
        <div className="mb-2.5 flex items-center gap-3 border-b border-border px-2 pb-4 pt-1.5">
          <div className="grid h-[42px] w-[42px] place-items-center rounded-xl border border-border-2 bg-surface">
            <Crest className="h-6 w-6 text-accent" />
          </div>
          <div>
            <div className="font-display text-[1.06rem] leading-none tracking-[0.14em]">IRON&nbsp;WOLF</div>
            <div className="mt-1.5 text-[0.62rem] uppercase tracking-[0.22em] text-faint">Poste de commandement</div>
          </div>
        </div>

        {NAV.map((group) => (
          <div key={group.title}>
            <div className="px-2.5 pb-1.5 pt-3.5 text-[0.62rem] uppercase tracking-[0.18em] text-faint">{group.title}</div>
            {group.items.map((it) => {
              const active = path === it.href;
              const Icon = it.icon;
              return (
                <Link
                  key={it.href}
                  href={it.href}
                  onClick={() => setOpen(false)}
                  className={clsx(
                    "relative flex items-center gap-2.5 rounded-[10px] px-2.5 py-2.5 text-[0.87rem] font-medium transition-colors",
                    active
                      ? "bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] text-ink before:absolute before:-left-3.5 before:bottom-2 before:top-2 before:w-[3px] before:rounded-r before:bg-accent before:content-['']"
                      : "text-muted hover:bg-[color-mix(in_srgb,var(--ink)_6%,transparent)] hover:text-ink"
                  )}
                >
                  <Icon className="h-[18px] w-[18px] shrink-0 opacity-90" strokeWidth={1.8} />
                  <span>{it.label}</span>
                  {it.badge ? (
                    <span className="ml-auto grid h-[18px] min-w-[18px] place-items-center rounded-full bg-accent px-1.5 text-[0.64rem] font-extrabold text-black/85">
                      {it.badge}
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </div>
        ))}

        <div className="mt-auto flex items-center gap-2.5 border-t border-border px-2 pb-0.5 pt-3">
          <span className="h-2 w-2 rounded-full" style={{ background: connecte ? "var(--good)" : "var(--faint)" }} />
          <span className="text-[0.72rem] text-muted">{connecte ? "Base connectée — données en direct" : "Base non connectée — Phase 1"}</span>
        </div>
      </aside>

      {open ? <div className="fixed inset-0 z-30 bg-black/50 lg:hidden" onClick={() => setOpen(false)} /> : null}

      {/* ============ MAIN ============ */}
      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-20 flex items-center gap-4 border-b border-border bg-[color-mix(in_srgb,var(--bg)_82%,transparent)] px-4 py-3.5 backdrop-blur-md sm:px-6">
          <button
            onClick={() => setOpen((v) => !v)}
            className="grid h-10 w-10 place-items-center rounded-xl border border-border bg-surface text-ink lg:hidden"
            aria-label="Menu"
          >
            <Menu className="h-[18px] w-[18px]" />
          </button>

          <label className="flex max-w-[420px] flex-1 items-center gap-2.5 rounded-xl border border-border bg-surface px-3.5 py-2.5 text-muted focus-within:border-[color-mix(in_srgb,var(--accent)_55%,var(--border))]">
            <Search className="h-4 w-4" />
            <input
              className="w-full border-0 bg-transparent text-[0.86rem] text-ink outline-none placeholder:text-faint"
              placeholder="Rechercher un membre, un contrat, une opération…"
              aria-label="Recherche"
            />
            <kbd className="hidden rounded-md border border-border-2 px-1.5 py-0.5 font-num text-[0.66rem] text-faint sm:inline">⌘K</kbd>
          </label>

          <div className="flex rounded-xl border border-border bg-surface p-[3px]">
            {(["iwc", "confrerie"] as Pole[]).map((p) => (
              <button
                key={p}
                onClick={() => choisirPole(p)}
                className={clsx(
                  "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[0.78rem] font-semibold transition",
                  pole === p ? "text-ink" : "text-muted",
                  p === "iwc" ? "data-[on=true]:shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--brass)_45%,transparent)]" : "data-[on=true]:shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--oxblood)_45%,transparent)]"
                )}
                data-on={pole === p}
                style={pole === p ? { background: "color-mix(in srgb, currentColor 16%, transparent)" } : undefined}
              >
                <span className="h-2 w-2 rounded-full" style={{ background: pole === p ? "var(--accent)" : p === "iwc" ? "var(--brass)" : "var(--oxblood)", opacity: pole === p ? 1 : 0.6 }} />
                <span className="hidden sm:inline" style={{ color: p === "iwc" ? "var(--brass)" : "var(--oxblood)", ...(pole === p ? { color: "var(--ink)" } : {}) }}>
                  {p === "iwc" ? "Iron Wolf" : "Confrérie"}
                </span>
              </button>
            ))}
          </div>

          <button className="relative grid h-10 w-10 place-items-center rounded-xl border border-border bg-surface text-muted hover:text-ink" aria-label="Notifications">
            <Bell className="h-[18px] w-[18px]" />
          </button>

          <div className="flex items-center gap-2.5 rounded-xl border border-border bg-surface py-[5px] pl-[5px] pr-1.5">
            {me.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={me.avatarUrl} alt="" className="h-[30px] w-[30px] rounded-lg object-cover" />
            ) : (
              <div className="grid h-[30px] w-[30px] place-items-center rounded-lg text-[0.8rem] font-extrabold text-black/85" style={{ background: "linear-gradient(135deg,var(--accent),color-mix(in srgb,var(--accent) 30%,#000))" }}>
                {me.initiales}
              </div>
            )}
            <div className="hidden leading-tight sm:block">
              <b className="text-[0.8rem] font-semibold">{me.nom}</b>
              <span className="block text-[0.66rem] text-faint">{me.role}</span>
            </div>
          </div>

          {profil ? <LogoutButton /> : null}
        </header>

        <main className="mx-auto flex w-full max-w-[1360px] flex-col gap-5 px-4 pb-10 pt-6 sm:px-6">{children}</main>
      </div>
    </div>
  );
}
