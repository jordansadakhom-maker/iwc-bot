"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, CornerDownLeft, ArrowRight, Loader2 } from "lucide-react";
import { NAV } from "@/lib/data";
import { rechercheGlobale, type ResultatRecherche } from "@/app/(app)/search-actions";

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

type Item = { kind: "nav" | "data"; label: string; sous: string; href: string };

// Palette de commande globale (⌘K / Ctrl+K). Navigue vers les sections et
// cherche membres / opérations / clients / contrats / armes en direct.
export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [resultats, setResultats] = useState<ResultatRecherche[]>([]);
  const [charge, setCharge] = useState(false);
  const [actif, setActif] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const navItems = useMemo(() => NAV.flatMap((g) => g.items.map((it) => ({ ...it, groupe: g.title }))), []);

  // Réinitialise à l'ouverture + focus.
  useEffect(() => {
    if (open) { setQ(""); setResultats([]); setActif(0); setTimeout(() => inputRef.current?.focus(), 20); }
  }, [open]);

  // Recherche serveur (débouncée) sur les entités.
  useEffect(() => {
    if (!open) return;
    const terme = q.trim();
    if (terme.length < 2) { setResultats([]); setCharge(false); return; }
    setCharge(true);
    const t = setTimeout(async () => {
      try { setResultats(await rechercheGlobale(terme)); } catch { setResultats([]); }
      setCharge(false);
    }, 220);
    return () => clearTimeout(t);
  }, [q, open]);

  // Sections filtrées (client, instantané) + entités (serveur).
  const items: Item[] = useMemo(() => {
    const nq = norm(q.trim());
    const nav = navItems
      .filter((it) => !nq || norm(it.label).includes(nq))
      .slice(0, nq ? 6 : navItems.length)
      .map((it) => ({ kind: "nav" as const, label: it.label, sous: it.groupe, href: it.href }));
    const data = resultats.map((r) => ({ kind: "data" as const, label: r.label, sous: `${r.type}${r.sous ? " · " + r.sous : ""}`, href: r.href }));
    return [...nav, ...data];
  }, [q, navItems, resultats]);

  useEffect(() => { setActif(0); }, [items.length]);

  function choisir(it: Item | undefined) {
    if (!it) return;
    onClose();
    router.push(it.href);
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); setActif((i) => Math.min(i + 1, items.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActif((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); choisir(items[actif]); }
    else if (e.key === "Escape") { e.preventDefault(); onClose(); }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center px-4 pt-[12vh]" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-[560px] overflow-hidden rounded-2xl border border-border-2 bg-surface shadow-2xl" style={{ boxShadow: "0 24px 60px -12px rgba(0,0,0,0.6)" }}>
        <div className="flex items-center gap-3 border-b border-border px-4 py-3">
          <Search className="h-[18px] w-[18px] text-faint" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKey}
            placeholder="Aller à… ou chercher un membre, contrat, arme, opération…"
            className="w-full border-0 bg-transparent text-[0.95rem] text-ink outline-none placeholder:text-faint"
          />
          {charge ? <Loader2 className="h-4 w-4 animate-spin text-faint" /> : <kbd className="rounded-md border border-border-2 px-1.5 py-0.5 font-num text-[0.64rem] text-faint">Esc</kbd>}
        </div>

        <div className="max-h-[52vh] overflow-y-auto py-1.5">
          {items.length === 0 ? (
            <p className="px-4 py-6 text-center text-[0.85rem] text-faint">{q.trim().length >= 2 ? "Aucun résultat." : "Tape pour chercher, ou choisis une section."}</p>
          ) : (
            items.map((it, i) => (
              <button
                key={`${it.kind}-${it.href}-${it.label}-${i}`}
                onMouseEnter={() => setActif(i)}
                onClick={() => choisir(it)}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors"
                style={{ background: i === actif ? "color-mix(in srgb,var(--accent) 14%,transparent)" : "transparent" }}
              >
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-border text-[0.62rem] font-bold uppercase" style={{ color: it.kind === "nav" ? "var(--muted)" : "var(--accent)", background: "var(--surface-2)" }}>
                  {it.kind === "nav" ? "↥" : "•"}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.88rem] font-medium text-ink">{it.label}</span>
                  <span className="block truncate text-[0.72rem] text-faint">{it.sous}</span>
                </span>
                {i === actif ? <CornerDownLeft className="h-4 w-4 shrink-0 text-faint" /> : <ArrowRight className="h-4 w-4 shrink-0 text-faint opacity-0" />}
              </button>
            ))
          )}
        </div>

        <div className="flex items-center justify-between border-t border-border px-4 py-2 text-[0.66rem] text-faint">
          <span className="flex items-center gap-1.5"><kbd className="rounded border border-border-2 px-1 py-0.5 font-num">↑</kbd><kbd className="rounded border border-border-2 px-1 py-0.5 font-num">↓</kbd> naviguer</span>
          <span className="flex items-center gap-1.5"><kbd className="rounded border border-border-2 px-1 py-0.5 font-num">↵</kbd> ouvrir</span>
        </div>
      </div>
    </div>
  );
}
