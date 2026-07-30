"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, Cross, Search, Bell, ChevronDown, LayoutGrid, Siren } from "lucide-react";
import { DISP_NAV, DISP_EXTRA, DISP_CATEGORIES, DISP_DIRECT, DISP_DIRECTION, tabsDeCategorie, aPermDirection, aAccesDirection, type PermsLike, type DispTab } from "@/lib/dispensaire-nav";
import { RegistreHeader } from "@/components/dispensaire-ui";
import { LogoutButton } from "@/components/logout-button";
import { DispensaireCommandCenter } from "@/components/dispensaire-command-center";

// Coquille de la section « Dispensaire de Saint-Denis » : en-tête registre 1904
// + menu par CATÉGORIES (Accueil / Assistant en accès direct, puis des menus
// déroulants Soins / Stock / Administratif / Direction 🔒 / Ressources). La
// catégorie Direction n'apparaît qu'aux comptes habilités, et chaque outil y est
// filtré par sa permission exacte.
export function DispensaireShell({ children, perms = {}, notifCount = 0, standalone = false, dateline }: { children: React.ReactNode; perms?: PermsLike; notifCount?: number; standalone?: boolean; dateline?: string }) {
  const path = usePathname();
  const [openCat, setOpenCat] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const habilite = !!(perms.rh || perms.factures || perms.admin);

  // Mode Urgence : bascule d'ambiance (rouge dominant) mémorisée localement,
  // partagée par toute la section via l'attribut data-mode sur la coquille.
  const [urgence, setUrgence] = useState(false);
  useEffect(() => { try { setUrgence(localStorage.getItem("disp-urgence") === "1"); } catch { /* stockage indisponible */ } }, []);
  const basculerUrgence = () => setUrgence((v) => { const n = !v; try { localStorage.setItem("disp-urgence", n ? "1" : "0"); } catch { /* ignore */ } return n; });

  // Ferme le menu ouvert au clic extérieur ou au changement de page.
  useEffect(() => { setOpenCat(null); }, [path]);
  useEffect(() => {
    if (!openCat) return;
    const onDown = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpenCat(null); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [openCat]);

  const estActif = (href: string) => (href === "/dispensaire" ? path === "/dispensaire" : path.startsWith(href));

  // Onglets d'accès direct (Accueil, Assistant), masquant le Répertoire en mode autonome.
  const directs = DISP_DIRECT.filter((t) => t.pret && !(standalone && t.href === "/repertoire"));

  // Onglets accessibles d'une catégorie (filtrés par permission).
  const tabsVisibles = (key: string): DispTab[] => {
    if (key === "direction") return DISP_DIRECTION.filter((t) => aPermDirection(perms, t.perm));
    return tabsDeCategorie(key as DispTab["cat"] & string).filter((t) => t.pret && (!t.restreint || habilite) && !(standalone && t.href === "/repertoire"));
  };
  // Catégories affichées : Direction seulement si le compte y a accès ; on masque une catégorie vide.
  const categories = DISP_CATEGORIES
    .filter((c) => (c.direction ? aAccesDirection(perms) : true))
    .map((c) => ({ ...c, tabs: tabsVisibles(c.key) }))
    .filter((c) => c.tabs.length > 0);

  // En-tête de folio de la page courante : correspondance la plus précise (préfixe
  // le plus long) dans la nav, sinon table des routes annexes.
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

  const lienTab = (t: DispTab, onNav?: () => void) => {
    const Icon = t.icon;
    const on = estActif(t.href);
    return (
      <Link key={t.href} href={t.href} onClick={onNav} className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-[0.82rem] font-semibold transition"
        style={on ? { color: "#f8f1dd", background: "var(--accent)" } : { color: "var(--muted)" }}>
        <Icon className="h-4 w-4 shrink-0" /> <span className="truncate">{t.label}</span>
      </Link>
    );
  };

  return (
    <div className="disp-premium min-h-screen px-3 py-6" data-mode={urgence ? "urgence" : undefined}>
      <div className="disp-premium__canvas mx-auto max-w-[1180px] px-4 py-5 sm:px-6">
        {/* Cartouche de couverture du registre */}
        <header className="flex items-start justify-between gap-3 border-b-2 pb-3" style={{ borderColor: "color-mix(in srgb,var(--accent) 45%,var(--border))" }}>
          <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border-2 sm:h-12 sm:w-12" style={{ borderColor: "color-mix(in srgb,var(--accent) 55%,var(--border))", background: "color-mix(in srgb,var(--accent) 12%,transparent)" }}>
              <Cross className="h-5 w-5 text-accent" strokeWidth={2.2} />
            </span>
            <div className="min-w-0">
              <div className="truncate text-[0.5rem] font-semibold uppercase tracking-[0.22em] text-faint sm:text-[0.56rem] sm:tracking-[0.34em]">Comté de Lemoyne · Saint-Denis</div>
              <div className="truncate font-display text-[1.15rem] leading-tight tracking-[0.02em] sm:text-[1.55rem]">Dispensaire de Saint-Denis</div>
              <div className="hidden text-[0.76rem] italic text-faint sm:block">Grand-livre administratif · Année 1904</div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <button type="button" onClick={basculerUrgence} aria-pressed={urgence} title={urgence ? "Désactiver le mode urgence" : "Activer le mode urgence"}
              className={`grid h-8 w-8 place-items-center rounded-lg border transition ${urgence ? "disp-urgent text-white" : "border-border bg-surface-2 text-muted hover:border-border-2 hover:text-ink"}`}
              style={urgence ? { background: "var(--crit)", borderColor: "var(--crit)" } : undefined}>
              <Siren className="h-4 w-4" />
            </button>
            <DispensaireCommandCenter perms={perms} standalone={standalone} />
            <Link href="/dispensaire/recherche" title="Recherche globale" className="grid h-8 w-8 place-items-center rounded-lg border border-border bg-surface-2 text-muted transition hover:border-border-2 hover:text-ink sm:hidden">
              <Search className="h-4 w-4" />
            </Link>
            <Link href="/dispensaire/notifications" title="Notifications" className="relative grid h-8 w-8 place-items-center rounded-lg border border-border bg-surface-2 text-muted transition hover:border-border-2 hover:text-ink">
              <Bell className="h-4 w-4" />
              {notifCount > 0 ? <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full px-1 text-[0.58rem] font-bold text-white" style={{ background: "var(--oxblood)" }}>{notifCount > 9 ? "9+" : notifCount}</span> : null}
            </Link>
            {standalone ? (
              <LogoutButton />
            ) : (
              <Link href="/dashboard" title="Retour à Iron Wolf" className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-[0.74rem] font-semibold text-muted transition hover:border-border-2 hover:text-ink sm:px-2.5">
                <ArrowLeft className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Iron Wolf</span>
              </Link>
            )}
          </div>
        </header>

        {/* Menu par catégories. z-index élevé + position relative : la feuille de
            registre force z-index:1 sur ses enfants directs (nav ET main) ; sans
            ça, le <main> (plus bas dans le DOM) passerait AU-DESSUS des menus
            déroulants du <nav>. On remonte donc le nav au-dessus du contenu. */}
        <nav ref={menuRef} style={{ position: "relative", zIndex: 40 }} className="mt-3 flex flex-wrap items-center gap-1.5">
          {/* Accès direct */}
          {directs.map((t) => {
            const Icon = t.icon;
            const on = estActif(t.href);
            return (
              <Link key={t.href} href={t.href} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[0.8rem] font-semibold transition"
                style={on ? { color: "#f8f1dd", background: "var(--accent)" } : { color: "var(--muted)" }}>
                <Icon className="h-3.5 w-3.5" /> {t.label}
              </Link>
            );
          })}

          {/* Catégories (menus déroulants) */}
          {categories.map((c) => {
            const Icon = c.icon;
            const open = openCat === c.key;
            const actif = c.tabs.some((t) => estActif(t.href)) || (c.direction && path.startsWith("/dispensaire/direction"));
            return (
              <div key={c.key} className="relative">
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => setOpenCat(open ? null : c.key)}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[0.8rem] font-semibold transition"
                  style={actif ? { color: "#f8f1dd", background: "color-mix(in srgb,var(--accent) 82%,#000)" } : { color: "var(--muted)", background: open ? "var(--surface-2)" : "transparent" }}
                >
                  <Icon className="h-3.5 w-3.5" /> {c.label}
                  {c.direction ? <span className="text-[0.7rem]" title="Espace protégé">🔒</span> : null}
                  <ChevronDown className="h-3.5 w-3.5 transition" style={{ transform: open ? "rotate(180deg)" : "none" }} />
                </button>
                {open ? (
                  <div className="absolute left-0 top-full z-30 mt-1 min-w-[220px] rounded-xl border border-border bg-surface p-1.5 shadow-card" style={{ background: "linear-gradient(180deg,var(--surface),color-mix(in srgb,var(--surface) 92%,#000))" }}>
                    {c.direction ? (
                      <Link href="/dispensaire/direction" onClick={() => setOpenCat(null)} className="mb-1 flex items-center gap-2 rounded-lg border-b border-border px-2.5 py-2 text-[0.8rem] font-semibold text-accent hover:brightness-110">
                        <LayoutGrid className="h-4 w-4" /> Vue d&apos;ensemble
                      </Link>
                    ) : null}
                    <div className="flex flex-col gap-0.5">
                      {c.tabs.map((t) => lienTab(t, () => setOpenCat(null)))}
                    </div>
                  </div>
                ) : null}
              </div>
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
