import { Feather, type LucideIcon } from "lucide-react";

// Primitives d'ambiance « registre 1904 » partagées par toutes les pages du
// Dispensaire : en-tête de folio, sceau de cire, fleuron, cartouches et états
// vides. Purement présentationnel (aucun hook) → utilisable côté serveur comme
// côté client. Rien de tout ceci ne touche aux données : c'est de la mise en scène.

const accentBorder = "color-mix(in srgb,var(--accent) 45%,var(--border))";

// Fleuron : filet d'encre doublé avec un ornement central, comme un trait de
// séparation à la plume dans un vieux registre.
export function Fleuron({ className = "" }: { className?: string }) {
  return (
    <div className={"flex items-center gap-3 " + className} aria-hidden>
      <span className="h-px flex-1" style={{ background: "linear-gradient(90deg,transparent,color-mix(in srgb,var(--accent) 55%,transparent))" }} />
      <svg width="34" height="10" viewBox="0 0 34 10" fill="none" className="shrink-0">
        <path d="M17 1.2 20 5l-3 3.8L14 5l3-3.8Z" fill="color-mix(in srgb,var(--accent) 70%,transparent)" />
        <circle cx="5" cy="5" r="1.5" fill="color-mix(in srgb,var(--accent) 55%,transparent)" />
        <circle cx="29" cy="5" r="1.5" fill="color-mix(in srgb,var(--accent) 55%,transparent)" />
      </svg>
      <span className="h-px flex-1" style={{ background: "linear-gradient(90deg,color-mix(in srgb,var(--accent) 55%,transparent),transparent)" }} />
    </div>
  );
}

// Sceau de cire pressé : un disque légèrement incliné, embossé d'une croix
// médicale, comme une empreinte de tampon officiel sur la page.
export function SceauCire({ size = 56 }: { size?: number }) {
  return (
    <div
      className="grid shrink-0 place-items-center rounded-full"
      aria-hidden
      style={{
        width: size,
        height: size,
        transform: "rotate(-8deg)",
        background: "radial-gradient(circle at 34% 28%, color-mix(in srgb,var(--oxblood) 78%,#000), color-mix(in srgb,var(--oxblood) 55%,#000) 70%)",
        boxShadow: "inset 0 1px 2px rgba(255,255,255,.18), inset 0 -2px 4px rgba(0,0,0,.5), 0 2px 5px rgba(0,0,0,.35)",
        border: "1px solid color-mix(in srgb,var(--oxblood) 40%,#000)",
      }}
    >
      <span className="grid place-items-center rounded-full" style={{ width: size - 14, height: size - 14, border: "1px dashed rgba(255,240,225,.28)" }}>
        <svg viewBox="0 0 24 24" width={size * 0.4} height={size * 0.4} fill="rgba(255,238,222,.85)">
          <path d="M10 2h4a1 1 0 0 1 1 1v6h6a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1h-6v6a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1v-6H3a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1h6V3a1 1 0 0 1 1-1Z" />
        </svg>
      </span>
    </div>
  );
}

// En-tête de folio : la « une » de chaque onglet. Bandeau d'ambiance qui pose la
// page (eyebrow, titre gravé, sous-titre d'époque, sceau + date + numéro de folio).
export function RegistreHeader({ titre, sous, folio, dateline }: { titre: string; sous?: string; folio?: string; dateline?: string }) {
  return (
    <header className="iwc-rise mb-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[0.62rem] font-semibold uppercase tracking-[0.22em] text-faint">Registre du Dispensaire · Saint-Denis</div>
          <h1 className="mt-1 font-display text-[1.7rem] leading-tight tracking-[0.01em] text-ink">{titre}</h1>
          {sous ? <p className="mt-1 max-w-xl font-display text-[0.92rem] italic text-muted">{sous}</p> : null}
        </div>
        <div className="flex shrink-0 flex-col items-center gap-1.5">
          <SceauCire />
          {dateline ? <span className="whitespace-nowrap font-num text-[0.6rem] text-faint">{dateline}</span> : null}
          {folio ? <span className="rounded-full border px-1.5 text-[0.56rem] font-bold uppercase tracking-[0.08em] text-faint" style={{ borderColor: accentBorder }}>{folio}</span> : null}
        </div>
      </div>
      <Fleuron className="mt-3" />
    </header>
  );
}

// État vide « à la page blanche » : quand un registre n'a encore rien reçu, on
// l'affiche comme une feuille en attente d'écriture plutôt qu'une ligne sèche.
export function VideRegistre({ titre, sous, icon: Icon = Feather }: { titre: string; sous?: string; icon?: LucideIcon }) {
  return (
    <div
      className="grid place-items-center rounded-[14px] border border-dashed px-6 py-12 text-center"
      style={{ borderColor: "color-mix(in srgb,var(--accent) 24%,var(--border))", background: "color-mix(in srgb,var(--accent) 3%,transparent)" }}
    >
      <span className="mb-3 grid h-14 w-14 place-items-center rounded-full border" style={{ borderColor: accentBorder, background: "color-mix(in srgb,var(--accent) 8%,transparent)" }}>
        <Icon className="h-6 w-6 text-accent" strokeWidth={1.7} />
      </span>
      <div className="font-display text-[1.05rem] text-ink">{titre}</div>
      {sous ? <p className="mt-1 max-w-sm text-[0.82rem] italic text-faint">{sous}</p> : null}
    </div>
  );
}

// Cartouche : petit encart chiffré (indicateur) au galbe de registre.
export function Cartouche({ label, valeur, ton, icon: Icon }: { label: string; valeur: React.ReactNode; ton?: string; icon?: LucideIcon }) {
  return (
    <div className="rounded-[12px] border border-border bg-surface-2 px-3 py-2">
      <div className="flex items-center gap-1.5 text-[0.6rem] font-semibold uppercase tracking-[0.09em] text-faint">
        {Icon ? <Icon className="h-3 w-3" /> : null}
        {label}
      </div>
      <div className="mt-0.5 font-num text-[1.2rem] font-bold leading-none" style={{ color: ton || "var(--ink)" }}>{valeur}</div>
    </div>
  );
}
