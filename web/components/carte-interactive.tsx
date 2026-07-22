"use client";

import { useRef, useState, useCallback, type PointerEvent as RPointerEvent, type WheelEvent as RWheelEvent } from "react";
import { Plus, Minus, Maximize2, MapPin, X, Route as RouteIcon, Compass } from "lucide-react";
import type { CarteData, CartePoint, CarteRoute } from "@/lib/queries";

// Types de lieux & d'itinéraires — mêmes clés que le bot Discord (carte.js).
const TYPES = [
  { key: "recolte", label: "Récolte", emoji: "🌿", color: "#54b085" },
  { key: "vendeur", label: "Vendeur", emoji: "🛒", color: "#c8a45c" },
  { key: "illegal", label: "Mission illégale", emoji: "🔪", color: "#b0413a" },
  { key: "chasse", label: "Chasse", emoji: "🦌", color: "#8a6d3b" },
  { key: "peche", label: "Pêche", emoji: "🎣", color: "#6f9fc4" },
  { key: "planque", label: "Planque", emoji: "🏚️", color: "#95a1b1" },
  { key: "four", label: "Four", emoji: "🔥", color: "#e0762e" },
  { key: "fleur_dragon", label: "Fleur du dragon", emoji: "🐉", color: "#54b085" },
  { key: "fournaise", label: "Fournaise", emoji: "⚒️", color: "#e0762e" },
  { key: "peches", label: "Pêches", emoji: "🍑", color: "#d8a53f" },
  { key: "autre", label: "Autre", emoji: "📌", color: "#95a1b1" },
];
const TYPE = (k: string) => TYPES.find((t) => t.key === k) || { key: k, label: k, emoji: "📌", color: "#95a1b1" };
const ROUTE_TYPES = [
  { key: "operation", label: "Opération", color: "#c82828", dash: "" },
  { key: "routine", label: "Routine", color: "#2870c8", dash: "" },
  { key: "convoi", label: "Convoi", color: "#b84fd0", dash: "" },
  { key: "repli", label: "Repli", color: "#e0762e", dash: "2.5 1.8" },
  { key: "patrouille", label: "Patrouille", color: "#3ca03c", dash: "1 1.6" },
  { key: "autre", label: "Itinéraire", color: "#c8a45c", dash: "2.5 1.8" },
];
const RTYPE = (k: string) => ROUTE_TYPES.find((t) => t.key === k) || ROUTE_TYPES[5];
const NIVEAU_EMOJI: Record<string, string> = { public: "🟢", membre: "🟡", confidentiel: "🔴" };
const NIVEAU_LABEL: Record<string, string> = { public: "Public", membre: "Membre", confidentiel: "Confidentiel" };
const REGIONS = ["Ambarino", "New Hanover", "Lemoyne", "West Elizabeth", "New Austin", "Guarma", "Autre"];

export function CarteInteractive({ data, imageUrl }: { data: CarteData; imageUrl?: string | null }) {
  const { points, routes } = data;
  const typesPresents = TYPES.filter((t) => points.some((p) => p.type === t.key));
  const [actifs, setActifs] = useState<Set<string>>(() => new Set(TYPES.map((t) => t.key)));
  const [routesOn, setRoutesOn] = useState(true);
  const [sel, setSel] = useState<CartePoint | null>(null);

  // Transform (pan + zoom) appliqué au « monde » de la carte.
  const [t, setT] = useState({ x: 0, y: 0, z: 1 });
  const drag = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const viewport = useRef<HTMLDivElement | null>(null);
  const moved = useRef(false);

  const posPoints = points.filter((p) => p.x != null && p.y != null && actifs.has(p.type));
  const sansPos = points.filter((p) => p.x == null || p.y == null);
  const visRoutes = routesOn ? routes.filter((r) => r.points.length >= 2) : [];

  const toggle = (k: string) => setActifs((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const tousActifs = typesPresents.length > 0 && typesPresents.every((ty) => actifs.has(ty.key));
  const toggleTous = () => setActifs(() => (tousActifs ? new Set<string>() : new Set(typesPresents.map((ty) => ty.key))));
  const reset = () => setT({ x: 0, y: 0, z: 1 });

  const onWheel = useCallback((e: RWheelEvent) => {
    e.preventDefault();
    const rect = viewport.current?.getBoundingClientRect();
    if (!rect) return;
    const cx = e.clientX - rect.left, cy = e.clientY - rect.top;
    setT((p) => {
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      const z = Math.min(6, Math.max(1, p.z * factor));
      const k = z / p.z;
      // Zoom centré sur le curseur.
      return { z, x: cx - (cx - p.x) * k, y: cy - (cy - p.y) * k };
    });
  }, []);

  const onDown = (e: RPointerEvent) => { drag.current = { x: e.clientX, y: e.clientY, tx: t.x, ty: t.y }; moved.current = false; (e.target as HTMLElement).setPointerCapture?.(e.pointerId); };
  const onMove = (e: RPointerEvent) => {
    if (!drag.current) return;
    const dx = e.clientX - drag.current.x, dy = e.clientY - drag.current.y;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) moved.current = true;
    setT((p) => ({ ...p, x: drag.current!.tx + dx, y: drag.current!.ty + dy }));
  };
  const onUp = () => { drag.current = null; };

  const zoom = (dir: 1 | -1) => setT((p) => {
    const z = Math.min(6, Math.max(1, p.z * (dir > 0 ? 1.3 : 1 / 1.3)));
    const rect = viewport.current?.getBoundingClientRect();
    const cx = (rect?.width || 0) / 2, cy = (rect?.height || 0) / 2, k = z / p.z;
    return { z, x: cx - (cx - p.x) * k, y: cy - (cy - p.y) * k };
  });

  return (
    <div className="flex flex-col gap-3">
      {/* Filtres par type */}
      <div className="flex flex-wrap items-center gap-1.5">
        {typesPresents.length > 1 ? (
          <button onClick={toggleTous} title={tousActifs ? "Masquer tous les types" : "Afficher tous les types"}
            className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-[0.74rem] font-semibold text-muted transition hover:border-border-2 hover:text-ink">
            {tousActifs ? "Tout masquer" : "Tout afficher"}
          </button>
        ) : null}
        {typesPresents.map((ty) => {
          const on = actifs.has(ty.key);
          const n = points.filter((p) => p.type === ty.key).length;
          return (
            <button key={ty.key} onClick={() => toggle(ty.key)}
              className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.74rem] font-semibold transition"
              style={{ borderColor: on ? `color-mix(in srgb,${ty.color} 55%,var(--border))` : "var(--border)", background: on ? `color-mix(in srgb,${ty.color} 16%,transparent)` : "transparent", color: on ? "var(--ink)" : "var(--faint)", opacity: on ? 1 : 0.6 }}>
              <span>{ty.emoji}</span> {ty.label} <span className="font-num text-faint">{n}</span>
            </button>
          );
        })}
        {routes.length ? (
          <button onClick={() => setRoutesOn((v) => !v)} className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.74rem] font-semibold transition"
            style={{ borderColor: routesOn ? "color-mix(in srgb,var(--accent) 55%,var(--border))" : "var(--border)", background: routesOn ? "color-mix(in srgb,var(--accent) 14%,transparent)" : "transparent", color: routesOn ? "var(--ink)" : "var(--faint)" }}>
            <RouteIcon className="h-3.5 w-3.5" /> Itinéraires <span className="font-num text-faint">{routes.length}</span>
          </button>
        ) : null}
      </div>

      {/* La carte */}
      <div
        ref={viewport}
        onWheel={onWheel} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={onUp}
        className="relative overflow-hidden rounded-[14px] border border-border-2 select-none"
        style={{ height: "min(72vh, 720px)", cursor: drag.current ? "grabbing" : "grab", background: "radial-gradient(1200px 700px at 50% -5%, color-mix(in srgb,var(--accent) 7%,transparent), transparent 60%), #16130d", touchAction: "none" }}
      >
        {/* Monde (transformé) */}
        <div className="absolute left-0 top-0 origin-top-left" style={{ transform: `translate(${t.x}px,${t.y}px) scale(${t.z})` }}>
          <div className="relative" style={{ width: "min(72vh,720px)", aspectRatio: "1 / 1" }}>
            {imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imageUrl} alt="Carte" className="absolute inset-0 h-full w-full object-cover" draggable={false} />
            ) : (
              <FondParchemin />
            )}

            {/* Itinéraires (SVG en % du monde) */}
            {visRoutes.length ? (
              <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full">
                {visRoutes.map((r) => {
                  const rt = RTYPE(r.type);
                  const d = r.points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
                  return <path key={r.id} d={d} fill="none" stroke={rt.color} strokeWidth={0.5} strokeDasharray={rt.dash || undefined} strokeLinecap="round" strokeLinejoin="round" opacity={0.9} />;
                })}
              </svg>
            ) : null}

            {/* Marqueurs */}
            {posPoints.map((p) => {
              const ty = TYPE(p.type);
              const on = sel?.id === p.id;
              return (
                <button key={p.id} title={p.nom}
                  onClick={(e) => { e.stopPropagation(); if (!moved.current) setSel(p); }}
                  className="absolute grid -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border text-[0.7rem] shadow-md transition"
                  style={{
                    left: `${p.x}%`, top: `${p.y}%`,
                    width: on ? 26 : 22, height: on ? 26 : 22,
                    transform: `translate(-50%,-50%) scale(${1 / t.z})`,
                    background: `color-mix(in srgb,${ty.color} 80%,#000)`,
                    borderColor: on ? "#fff" : "color-mix(in srgb,#000 30%,transparent)",
                    zIndex: on ? 20 : 10,
                  }}>
                  <span style={{ fontSize: 11 }}>{ty.emoji}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Contrôles zoom */}
        <div className="absolute bottom-3 right-3 flex flex-col gap-1.5">
          <CtrlBtn onClick={() => zoom(1)} label="Zoom avant"><Plus className="h-4 w-4" /></CtrlBtn>
          <CtrlBtn onClick={() => zoom(-1)} label="Zoom arrière"><Minus className="h-4 w-4" /></CtrlBtn>
          <CtrlBtn onClick={reset} label="Réinitialiser"><Maximize2 className="h-4 w-4" /></CtrlBtn>
        </div>

        {/* Boussole */}
        <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-1.5 rounded-full border border-border-2 bg-black/40 px-2.5 py-1 text-[0.68rem] text-muted backdrop-blur">
          <Compass className="h-3.5 w-3.5 text-accent" /> {posPoints.length} lieu(x) situé(s)
        </div>

        {/* Popup détail */}
        {sel ? (
          <div className="absolute bottom-3 left-3 w-[min(340px,calc(100%-24px))] rounded-[12px] border border-border-2 bg-surface/95 p-3.5 shadow-card backdrop-blur">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="grid h-8 w-8 place-items-center rounded-lg text-[0.95rem]" style={{ background: `color-mix(in srgb,${TYPE(sel.type).color} 22%,transparent)` }}>{TYPE(sel.type).emoji}</span>
                <div>
                  <div className="text-[0.92rem] font-semibold leading-tight">{sel.nom}</div>
                  <div className="text-[0.7rem] text-faint">{TYPE(sel.type).label}{sel.region ? ` · ${sel.region}` : ""}</div>
                </div>
              </div>
              <button onClick={() => setSel(null)} className="text-faint hover:text-ink"><X className="h-4 w-4" /></button>
            </div>
            {sel.lieu ? <div className="mt-2 flex items-start gap-1.5 text-[0.8rem] text-muted"><MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-faint" /> {sel.lieu}</div> : null}
            {sel.notes ? <div className="mt-1.5 text-[0.8rem] leading-relaxed text-muted">{sel.notes}</div> : null}
            <div className="mt-2 text-[0.7rem] text-faint">{NIVEAU_EMOJI[sel.niveau] || "⚪"} {NIVEAU_LABEL[sel.niveau] || sel.niveau}</div>
          </div>
        ) : null}
      </div>

      {/* Lieux sans position sur la carte (ajoutés depuis Discord sans coordonnées) */}
      {sansPos.length ? (
        <div className="rounded-[12px] border border-border bg-surface-2 p-3.5">
          <div className="mb-2 text-[0.72rem] uppercase tracking-[0.06em] text-faint">Lieux répertoriés sans position ({sansPos.length})</div>
          <div className="grid gap-x-4 gap-y-1.5 sm:grid-cols-2">
            {REGIONS.map((reg) => {
              const list = sansPos.filter((p) => (p.region || "Autre") === reg);
              if (!list.length) return null;
              return (
                <div key={reg} className="text-[0.8rem]">
                  <div className="mb-0.5 text-[0.68rem] uppercase tracking-[0.05em] text-faint">{reg}</div>
                  {list.map((p) => (
                    <div key={p.id} className="flex items-center gap-1.5 py-0.5 text-muted">
                      <span>{TYPE(p.type).emoji}</span>
                      <span className="text-ink">{p.nom}</span>
                      {p.lieu ? <span className="truncate text-faint">— {p.lieu}</span> : null}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function CtrlBtn({ children, onClick, label }: { children: React.ReactNode; onClick: () => void; label: string }) {
  return (
    <button onClick={onClick} aria-label={label} title={label}
      className="grid h-9 w-9 place-items-center rounded-lg border border-border-2 bg-surface/90 text-muted backdrop-blur transition hover:text-ink">
      {children}
    </button>
  );
}

// Fond « parchemin » stylisé (original) : utilisé tant qu'aucune vraie image de
// carte n'est fournie (NEXT_PUBLIC_CARTE_IMAGE_URL). Repères de régions pour situer.
function FondParchemin() {
  return (
    <div className="absolute inset-0" style={{ background: "radial-gradient(120% 120% at 30% 20%, #2b2417, #1c1710 55%, #14100a)" }}>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
        <defs>
          <pattern id="grid" width="10" height="10" patternUnits="userSpaceOnUse">
            <path d="M10 0 L0 0 0 10" fill="none" stroke="#c8a45c" strokeWidth="0.15" opacity="0.18" />
          </pattern>
        </defs>
        <rect width="100" height="100" fill="url(#grid)" />
        <rect x="2" y="2" width="96" height="96" fill="none" stroke="#c8a45c" strokeWidth="0.4" opacity="0.35" />
        <rect x="3.4" y="3.4" width="93.2" height="93.2" fill="none" stroke="#c8a45c" strokeWidth="0.15" opacity="0.25" />
      </svg>
      {[
        { r: "Ambarino", x: 62, y: 16 }, { r: "New Hanover", x: 62, y: 42 }, { r: "Lemoyne", x: 74, y: 74 },
        { r: "West Elizabeth", x: 30, y: 50 }, { r: "New Austin", x: 20, y: 80 },
      ].map((z) => (
        <span key={z.r} className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 font-display uppercase tracking-[0.14em]"
          style={{ left: `${z.x}%`, top: `${z.y}%`, color: "color-mix(in srgb,var(--accent) 55%,transparent)", fontSize: "clamp(9px,1.4vw,15px)" }}>{z.r}</span>
      ))}
      <span className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 font-display italic" style={{ color: "color-mix(in srgb,var(--accent) 22%,transparent)", fontSize: "clamp(10px,1.6vw,16px)" }}>Territoire de la Compagnie</span>
    </div>
  );
}
