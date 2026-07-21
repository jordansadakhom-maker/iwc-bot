"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Radio, Pause, Play } from "lucide-react";
import type { FeedItem } from "@/lib/queries";

const TONE: Record<string, string> = {
  accent: "var(--accent)", good: "var(--good)", warn: "var(--warn)", muted: "var(--faint)", oxblood: "var(--oxblood)",
};

function ilYa(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso).getTime();
  if (!d) return "";
  const s = Math.max(0, Math.floor((Date.now() - d) / 1000));
  if (s < 60) return "à l'instant";
  const m = Math.floor(s / 60);
  if (m < 60) return `il y a ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `il y a ${h} h`;
  const j = Math.floor(h / 24);
  return `il y a ${j} j`;
}

// Journal d'activité « temps réel » : rafraîchit les données du serveur toutes les
// 25 s (en pause quand l'onglet est caché, ou sur demande). Pas de dépendance :
// s'appuie sur router.refresh() et le rendu serveur déjà en place.
export function LiveFeed({ items }: { items: FeedItem[] }) {
  const router = useRouter();
  const [live, setLive] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      router.refresh();
      setTick((n) => n + 1);
    }, 25000);
    return () => clearInterval(t);
  }, [live, router]);

  return (
    <section className="rounded-card border border-border bg-surface p-4 shadow-card sm:p-5">
      <div className="mb-3.5 flex items-center justify-between gap-2.5">
        <div className="flex items-center gap-2">
          <span className="font-display text-[1.02rem]">Journal d&apos;activité</span>
          {live ? (
            <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.62rem] font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--good)", background: "color-mix(in srgb,var(--good) 14%,transparent)" }}>
              <span className="relative flex h-1.5 w-1.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75" style={{ background: "var(--good)" }} /><span className="relative inline-flex h-1.5 w-1.5 rounded-full" style={{ background: "var(--good)" }} /></span>
              En direct
            </span>
          ) : (
            <span className="rounded-full px-2 py-0.5 text-[0.62rem] font-semibold uppercase tracking-[0.08em] text-faint" style={{ background: "var(--surface-2)" }}>En pause</span>
          )}
        </div>
        <button onClick={() => setLive((v) => !v)} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-[0.72rem] font-semibold text-muted transition hover:border-border-2 hover:text-ink" aria-label={live ? "Mettre en pause" : "Reprendre"}>
          {live ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          {live ? "Pause" : "Direct"}
        </button>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
          <Radio className="h-6 w-6 text-faint" />
          <span className="text-[0.82rem] text-faint">Rien à signaler pour l&apos;instant. L&apos;activité s&apos;affichera ici en direct.</span>
        </div>
      ) : (
        <ul className="flex flex-col" data-tick={tick}>
          {items.slice(0, 14).map((it) => {
            const c = TONE[it.tone] || "var(--muted)";
            const inner = (
              <>
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[0.9rem]" style={{ background: `color-mix(in srgb,${c} 14%,transparent)` }}>{it.icon}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.84rem] font-medium text-ink">{it.titre}</span>
                  {it.detail ? <span className="block truncate text-[0.74rem] text-muted">{it.detail}</span> : null}
                </span>
                <span className="shrink-0 whitespace-nowrap text-[0.68rem] text-faint">{ilYa(it.at)}</span>
              </>
            );
            return (
              <li key={it.id} className="border-b border-border last:border-b-0">
                {it.lien ? (
                  <Link href={it.lien} className="flex items-center gap-3 py-2.5 transition-colors hover:bg-[color-mix(in_srgb,var(--ink)_4%,transparent)]">{inner}</Link>
                ) : (
                  <div className="flex items-center gap-3 py-2.5">{inner}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
