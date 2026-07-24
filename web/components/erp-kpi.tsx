import type { Kpi } from "@/lib/erp-kpi-const";

// Bande KPI — rangée de « stat tiles » (chiffres phares) + mini-tendance
// facultative. Présentationnel, réutilisé par les deux Assistants.
// Suit le guide dataviz : une tuile n'est pas un graphe → chiffre en encre,
// statut porté par la teinte du nombre ; sparkline = série unique, trait fin,
// récessif, sans axe ni légende, résumé accessible en aria-label.

export function KpiBand({ items }: { items: Kpi[] }) {
  if (!items.length) return null;
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
      {items.map((k) => (
        <div key={k.id} className="rounded-[12px] border border-border bg-surface p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[0.62rem] font-semibold uppercase tracking-[0.05em] text-faint">{k.label}</span>
            {k.spark && k.spark.length > 1 ? <Sparkline data={k.spark} tone={k.tone || "var(--accent)"} /> : null}
          </div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="font-num text-[1.5rem] font-bold leading-none" style={{ color: k.tone || "var(--ink)" }}>{k.value}</span>
            {k.sub ? <span className="text-[0.7rem] text-faint">{k.sub}</span> : null}
          </div>
        </div>
      ))}
    </div>
  );
}

function Sparkline({ data, tone }: { data: number[]; tone: string }) {
  const w = 84, h = 26, pad = 3;
  const min = Math.min(...data), max = Math.max(...data), span = max - min || 1;
  const y = (v: number) => h - pad - ((v - min) / span) * (h - pad * 2);
  const x = (i: number) => (i / (data.length - 1)) * w;
  const pts = data.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const first = data[0], last = data[data.length - 1];
  const dir = last > first ? "en hausse" : last < first ? "en baisse" : "stable";
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} preserveAspectRatio="none" className="overflow-visible" role="img" aria-label={`Tendance ${dir}`}>
      <polyline points={pts} fill="none" stroke={tone} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" opacity={0.85} />
      <circle cx={x(data.length - 1)} cy={y(last)} r={2.4} fill={tone} />
    </svg>
  );
}
