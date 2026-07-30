"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, CornerDownLeft, ArrowUp, ArrowDown, Command, Bell, LayoutGrid } from "lucide-react";
import { DISP_NAV, DISP_DIRECTION, aPermDirection, type PermsLike, type DispTab } from "@/lib/dispensaire-nav";

// ⌘K — Command Center du Dispensaire. Palette de navigation/recherche universelle
// (Ctrl/⌘+K), 100 % CLIENT : clavier, filtre flou, saut instantané vers tout
// module autorisé. Zéro dépendance. Rendu dans la coquille (client) → aucun
// franchissement de frontière serveur→client.

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").trim();

type Destination = { href: string; label: string; icon: DispTab["icon"]; desc?: string; groupe: string };

export function DispensaireCommandCenter({ perms = {}, standalone = false }: { perms?: PermsLike; standalone?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const habilite = !!(perms.rh || perms.factures || perms.admin);

  // Destinations accessibles (mêmes règles que le menu : permission, restreint, standalone).
  const destinations = useMemo<Destination[]>(() => {
    const GROUPE: Record<string, string> = { medical: "Gestion médicale", rh: "Ressources humaines", ressources: "Ressources" };
    const normal = DISP_NAV
      .filter((t) => t.pret && !t.direction && (!t.restreint || habilite) && !(standalone && t.href === "/repertoire"))
      .map((t) => ({ href: t.href, label: t.label, icon: t.icon, desc: t.desc, groupe: t.cat ? GROUPE[t.cat] ?? "Dispensaire" : "Accès direct" }));
    const direction = DISP_DIRECTION
      .filter((t) => aPermDirection(perms, t.perm))
      .map((t) => ({ href: t.href, label: t.label, icon: t.icon, desc: t.desc, groupe: "Direction" }));
    const extras: Destination[] = [
      { href: "/dispensaire/recherche", label: "Recherche globale", icon: Search, desc: "Fouiller tout le registre", groupe: "Outils" },
      { href: "/dispensaire/notifications", label: "Notifications", icon: Bell, desc: "Avis et rappels", groupe: "Outils" },
    ];
    return [...normal, ...direction, ...extras];
  }, [perms, habilite, standalone]);

  // Filtre flou + option « rechercher partout ».
  const results = useMemo(() => {
    const query = norm(q);
    const base = query ? destinations.filter((d) => norm(`${d.label} ${d.desc ?? ""} ${d.groupe}`).includes(query)) : destinations;
    const liste = base.slice(0, 12);
    if (query) liste.push({ href: `/dispensaire/recherche?q=${encodeURIComponent(q.trim())}`, label: `Rechercher « ${q.trim()} » partout`, icon: Search, groupe: "Recherche" });
    return liste;
  }, [q, destinations]);

  // Ctrl/⌘+K bascule ; Échap ferme.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen((o) => !o); }
      else if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => { setSel(0); }, [q, open]);
  useEffect(() => {
    if (open) { const t = setTimeout(() => inputRef.current?.focus(), 20); return () => clearTimeout(t); }
    setQ("");
  }, [open]);

  const aller = (href: string) => { setOpen(false); router.push(href); };
  const onKeyNav = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setSel((x) => Math.min(results.length - 1, x + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSel((x) => Math.max(0, x - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); const d = results[sel]; if (d) aller(d.href); }
  };

  return (
    <>
      {/* Déclencheur discret dans l'en-tête */}
      <button type="button" onClick={() => setOpen(true)} title="Command Center (Ctrl/⌘ + K)"
        className="hidden items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-[0.72rem] font-semibold text-muted transition hover:border-border-2 hover:text-ink sm:inline-flex">
        <Command className="h-3.5 w-3.5" /> <span>Rechercher</span>
        <kbd className="ml-1 rounded border border-border bg-surface px-1 py-0.5 font-num text-[0.6rem] text-faint">⌘K</kbd>
      </button>

      {open ? (
        <div className="fixed inset-0 z-[100] flex items-start justify-center px-4 pt-[12vh]" role="dialog" aria-modal="true"
          style={{ background: "color-mix(in srgb,#000 55%,transparent)", backdropFilter: "blur(2px)" }} onMouseDown={() => setOpen(false)}>
          <div className="disp-glass disp-rise w-full max-w-[560px] overflow-hidden shadow-card" style={{ borderRadius: "var(--r-lg)" }} onMouseDown={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 border-b border-border px-3.5 py-3">
              <Search className="h-4 w-4 shrink-0 text-faint" />
              <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKeyNav}
                placeholder="Aller à un module, une page…" className="w-full bg-transparent text-[0.9rem] outline-none placeholder:text-faint" />
              <kbd className="rounded border border-border bg-surface-2 px-1.5 py-0.5 font-num text-[0.6rem] text-faint">Échap</kbd>
            </div>

            <div className="max-h-[52vh] overflow-y-auto p-1.5">
              {results.length === 0 ? (
                <p className="px-3 py-8 text-center text-[0.82rem] italic text-faint">Aucun résultat.</p>
              ) : results.map((d, idx) => {
                const Icon = d.icon;
                const on = idx === sel;
                const groupePrec = idx > 0 ? results[idx - 1].groupe : null;
                return (
                  <div key={d.href + idx}>
                    {d.groupe !== groupePrec ? <div className="px-2.5 pb-1 pt-2 text-[0.6rem] font-semibold uppercase tracking-[0.1em] text-faint">{d.groupe}</div> : null}
                    <button type="button" onMouseEnter={() => setSel(idx)} onClick={() => aller(d.href)}
                      className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition"
                      style={on ? { background: "color-mix(in srgb,var(--accent) 16%,transparent)" } : undefined}>
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md" style={{ background: "color-mix(in srgb,var(--accent) 12%,transparent)" }}>
                        <Icon className="h-3.5 w-3.5 text-accent" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[0.85rem] font-semibold">{d.label}</span>
                        {d.desc ? <span className="block truncate text-[0.7rem] text-faint">{d.desc}</span> : null}
                      </span>
                      {on ? <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-faint" /> : null}
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center gap-3 border-t border-border px-3.5 py-2 text-[0.66rem] text-faint">
              <span className="inline-flex items-center gap-1"><LayoutGrid className="h-3 w-3" /> {destinations.length} destinations</span>
              <span className="ml-auto inline-flex items-center gap-1"><ArrowUp className="h-3 w-3" /><ArrowDown className="h-3 w-3" /> naviguer</span>
              <span className="inline-flex items-center gap-1"><CornerDownLeft className="h-3 w-3" /> ouvrir</span>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
