// Graphiques légers en SVG/CSS pur — fiables sous React 19 (pas de dépendance),
// compatibles thème clair/sombre (couleurs via tokens du design system), et
// libellés directs (identité + valeur visibles, aucune interaction requise).

// ── Barres horizontales (comparaison de magnitudes, une seule teinte laiton) ──
export function BarresH({
  data,
  format,
}: {
  data: { label: string; value: number }[];
  format?: (n: number) => string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="flex flex-col gap-3">
      {data.map((d) => {
        const pct = d.value > 0 ? Math.max((d.value / max) * 100, 4) : 0;
        return (
          <div key={d.label}>
            <div className="mb-1 flex items-baseline justify-between gap-2 text-[0.78rem]">
              <span className="truncate text-muted">{d.label}</span>
              <span className="font-num font-semibold text-ink">{format ? format(d.value) : d.value}</span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full" style={{ background: "color-mix(in srgb,var(--ink) 8%,transparent)" }}>
              <div
                className="h-full rounded-full transition-[width]"
                style={{ width: `${pct}%`, background: "linear-gradient(90deg, color-mix(in srgb,var(--accent) 62%,#000), var(--accent))" }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Donut (répartition « parties d'un tout »), avec légende à libellés directs ──
export function Donut({ data }: { data: { label: string; value: number; color: string }[] }) {
  const sum = data.reduce((a, d) => a + d.value, 0);
  const R = 54, C = 2 * Math.PI * R, GAP = 6;
  let offset = 0;
  const segments = data.map((d) => {
    const len = sum > 0 ? (d.value / sum) * C : 0;
    const seg = Math.max(0, len - GAP);
    const node = d.value > 0 ? (
      <circle
        key={d.label}
        cx="70" cy="70" r={R} fill="none"
        stroke={d.color} strokeWidth="15" strokeLinecap="round"
        strokeDasharray={`${seg} ${C - seg}`} strokeDashoffset={-offset}
      />
    ) : null;
    offset += len;
    return node;
  });

  return (
    <div className="flex items-center gap-5">
      <div className="relative shrink-0">
        <svg viewBox="0 0 140 140" className="h-[132px] w-[132px] -rotate-90">
          <circle cx="70" cy="70" r={R} fill="none" stroke="color-mix(in srgb,var(--ink) 8%,transparent)" strokeWidth="15" />
          {segments}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-num text-2xl font-semibold text-ink">{sum}</span>
          <span className="text-[0.62rem] uppercase tracking-[0.12em] text-faint">total</span>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        {data.map((d) => (
          <div key={d.label} className="flex items-center gap-2 text-[0.8rem]">
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: d.color }} />
            <span className="text-muted">{d.label}</span>
            <span className="ml-auto pl-3 font-num font-semibold text-ink">{d.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
