"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Timer, ArrowRight } from "lucide-react";
import type { PointSession } from "@/lib/dispensaire-pointage";

const heureFR = (iso: string) => { try { return new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" }).format(new Date(iso)); } catch { return "—"; } };
function fmtMin(min: number) { if (min <= 0) return "0 min"; const h = Math.floor(min / 60), m = min % 60; return h ? `${h} h ${String(m).padStart(2, "0")}` : `${m} min`; }

// Encart d'accueil « Salariés en service » — chrono live (monté client only).
export function DispEnService({ sessions }: { sessions: PointSession[] }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    if (!sessions.length) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [sessions.length]);

  return (
    <Link href="/dispensaire/pointage" className="group flex items-center gap-3 rounded-[14px] border border-border bg-surface-2 p-4 transition hover:border-border-2">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full" style={{ background: sessions.length ? "color-mix(in srgb,var(--good) 16%,transparent)" : "color-mix(in srgb,var(--good) 8%,transparent)" }}>
        <Timer className="h-5 w-5" style={{ color: "var(--good)" }} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-[0.88rem] font-semibold">Salariés en service <span className="font-num" style={{ color: sessions.length ? "var(--good)" : "var(--faint)" }}>{sessions.length}</span></div>
        {sessions.length ? (
          <div className="mt-0.5 flex flex-col gap-0.5">
            {sessions.slice(0, 4).map((s) => {
              const live = now != null ? Math.max(0, Math.round((now - new Date(s.debut).getTime()) / 60000)) : null;
              return <div key={s.id} className="truncate text-[0.74rem] text-faint"><span className="font-semibold text-muted">{s.nom}</span> · depuis {heureFR(s.debut)}{live != null ? ` · ${fmtMin(live)}` : ""}</div>;
            })}
            {sessions.length > 4 ? <div className="text-[0.72rem] text-faint">+{sessions.length - 4} autre(s)…</div> : null}
          </div>
        ) : (
          <div className="text-[0.76rem] text-faint">Personne en service — ouvre le <b>Pointage</b> pour prendre son poste.</div>
        )}
      </div>
      <ArrowRight className="h-4 w-4 shrink-0 text-faint transition group-hover:translate-x-0.5" />
    </Link>
  );
}
