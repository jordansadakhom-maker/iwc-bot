"use client";

import { useRef, useState, useCallback, type PointerEvent as RPointerEvent, type WheelEvent as RWheelEvent } from "react";
import { useRouter } from "next/navigation";
import { Plus, Minus, Maximize2, MapPin, X, Route as RouteIcon, Compass, Pencil, Trash2, Image as ImageIcon, Check } from "lucide-react";
import type { CarteData, CartePoint, CarteRoute } from "@/lib/queries";
import { Modal, Flash, Champ, Picker, inputCls } from "@/components/edit-ui";
import { PhotoDrop } from "@/components/photo-drop";
import { creerLieu, majLieu, supprimerLieu, creerItineraire, supprimerItineraire, definirFondCarte } from "@/app/(app)/carte/actions";

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

type XY = { x: number; y: number };
type EditMode = "none" | "lieu" | "route";

export function CarteInteractive({ data, imageUrl }: { data: CarteData; imageUrl?: string | null }) {
  const router = useRouter();
  const canConf = data.peutConfidentiel;

  // État optimiste (ajouts/suppressions visibles immédiatement).
  const [points, setPoints] = useState<CartePoint[]>(data.points);
  const [routes, setRoutes] = useState<CarteRoute[]>(data.routes);
  const [img, setImg] = useState<string | null>(imageUrl ?? null);

  const typesPresents = TYPES.filter((t) => points.some((p) => p.type === t.key));
  const [actifs, setActifs] = useState<Set<string>>(() => new Set(TYPES.map((t) => t.key)));
  const [routesOn, setRoutesOn] = useState(true);
  const [sel, setSel] = useState<CartePoint | null>(null);
  const [flash, setFlash] = useState<{ t: "ok" | "bad"; m: string } | null>(null);

  // Édition
  const [mode, setMode] = useState<EditMode>("none");
  const [routePts, setRoutePts] = useState<XY[]>([]);
  const [lieuDraft, setLieuDraft] = useState<XY | null>(null); // création lieu (coords)
  const [lieuEdit, setLieuEdit] = useState<CartePoint | null>(null); // édition lieu
  const [routeDraft, setRouteDraft] = useState<XY[] | null>(null); // finalisation itinéraire
  const [fond, setFond] = useState(false);

  // Transform (pan + zoom).
  const [t, setT] = useState({ x: 0, y: 0, z: 1 });
  const drag = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const viewport = useRef<HTMLDivElement | null>(null);
  const world = useRef<HTMLDivElement | null>(null);
  const moved = useRef(false);

  const posPoints = points.filter((p) => p.x != null && p.y != null && actifs.has(p.type));
  const sansPos = points.filter((p) => p.x == null || p.y == null);
  const visRoutes = routesOn ? routes.filter((r) => r.points.length >= 2) : [];

  const toggle = (k: string) => setActifs((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const tousActifs = typesPresents.length > 0 && typesPresents.every((ty) => actifs.has(ty.key));
  const toggleTous = () => setActifs(() => (tousActifs ? new Set<string>() : new Set(typesPresents.map((ty) => ty.key))));
  const reset = () => setT({ x: 0, y: 0, z: 1 });

  // Pixel écran → coordonnées carte (0–100 %), robuste au pan/zoom (rect transformé).
  const toPct = useCallback((clientX: number, clientY: number): XY | null => {
    const rect = world.current?.getBoundingClientRect();
    if (!rect || !rect.width || !rect.height) return null;
    return { x: Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100)), y: Math.min(100, Math.max(0, ((clientY - rect.top) / rect.height) * 100)) };
  }, []);

  const onWheel = useCallback((e: RWheelEvent) => {
    e.preventDefault();
    const rect = viewport.current?.getBoundingClientRect();
    if (!rect) return;
    const cx = e.clientX - rect.left, cy = e.clientY - rect.top;
    setT((p) => { const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15; const z = Math.min(6, Math.max(1, p.z * factor)); const k = z / p.z; return { z, x: cx - (cx - p.x) * k, y: cy - (cy - p.y) * k }; });
  }, []);

  const onDown = (e: RPointerEvent) => { drag.current = { x: e.clientX, y: e.clientY, tx: t.x, ty: t.y }; moved.current = false; (e.target as HTMLElement).setPointerCapture?.(e.pointerId); };
  const onMove = (e: RPointerEvent) => {
    if (!drag.current) return;
    const dx = e.clientX - drag.current.x, dy = e.clientY - drag.current.y;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) moved.current = true;
    setT((p) => ({ ...p, x: drag.current!.tx + dx, y: drag.current!.ty + dy }));
  };
  const onUp = () => { drag.current = null; };

  // Clic sur la carte en mode édition : place un lieu, ou ajoute un point d'itinéraire.
  const onMapClick = (e: React.MouseEvent) => {
    if (mode === "none" || moved.current) return;
    const pct = toPct(e.clientX, e.clientY);
    if (!pct) return;
    if (mode === "lieu") setLieuDraft(pct);
    else if (mode === "route") setRoutePts((prev) => [...prev, pct]);
  };

  const zoom = (dir: 1 | -1) => setT((p) => { const z = Math.min(6, Math.max(1, p.z * (dir > 0 ? 1.3 : 1 / 1.3))); const rect = viewport.current?.getBoundingClientRect(); const cx = (rect?.width || 0) / 2, cy = (rect?.height || 0) / 2, k = z / p.z; return { z, x: cx - (cx - p.x) * k, y: cy - (cy - p.y) * k }; });

  // ── Écritures optimistes ──
  async function ajouterLieu(d: { nom: string; type: string; niveau: string; region: string; lieu: string; notes: string; x: number; y: number }) {
    const tmpId = "tmp-" + Math.random().toString(36).slice(2, 8);
    setPoints((prev) => [...prev, { id: tmpId, nom: d.nom, type: d.type, niveau: d.niveau, region: d.region || null, lieu: d.lieu || null, notes: d.notes || null, x: d.x, y: d.y, source: "web" }]);
    setMode("none"); setLieuDraft(null);
    const r = await creerLieu(d);
    if (!r.ok) { setPoints((prev) => prev.filter((p) => p.id !== tmpId)); setFlash({ t: "bad", m: r.error || "Ajout impossible." }); }
    else { setPoints((prev) => prev.map((p) => (p.id === tmpId ? { ...p, id: r.id || tmpId } : p))); setFlash({ t: "ok", m: `Lieu « ${d.nom} » ajouté.` }); router.refresh(); }
  }
  async function editerLieu(id: string, patch: { nom: string; type: string; niveau: string; region: string; lieu: string; notes: string }) {
    setPoints((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch, region: patch.region || null, lieu: patch.lieu || null, notes: patch.notes || null } : p)));
    setLieuEdit(null); setSel(null);
    const r = await majLieu(id, patch);
    if (!r.ok) setFlash({ t: "bad", m: r.error || "Modification impossible." }); else router.refresh();
  }
  async function retirerLieu(id: string) {
    setPoints((prev) => prev.filter((p) => p.id !== id)); setSel(null);
    const r = await supprimerLieu(id);
    if (!r.ok) setFlash({ t: "bad", m: r.error || "Suppression impossible." }); else router.refresh();
  }
  async function ajouterItineraire(d: { nom: string; type: string; niveau: string; notes: string; points: XY[] }) {
    const tmpId = "tmp-" + Math.random().toString(36).slice(2, 8);
    setRoutes((prev) => [...prev, { id: tmpId, nom: d.nom, type: d.type, niveau: d.niveau, notes: d.notes || null, points: d.points, source: "web" }]);
    setMode("none"); setRoutePts([]); setRouteDraft(null);
    const r = await creerItineraire(d);
    if (!r.ok) { setRoutes((prev) => prev.filter((x) => x.id !== tmpId)); setFlash({ t: "bad", m: r.error || "Ajout impossible." }); }
    else { setRoutes((prev) => prev.map((x) => (x.id === tmpId ? { ...x, id: r.id || tmpId } : x))); setFlash({ t: "ok", m: `Itinéraire « ${d.nom} » tracé.` }); router.refresh(); }
  }
  async function retirerItineraire(id: string) {
    setRoutes((prev) => prev.filter((r) => r.id !== id));
    const r = await supprimerItineraire(id);
    if (!r.ok) setFlash({ t: "bad", m: r.error || "Suppression impossible." }); else router.refresh();
  }

  function annulerEdition() { setMode("none"); setRoutePts([]); setLieuDraft(null); }

  return (
    <div className="flex flex-col gap-3">
      {/* Barre d'édition */}
      <div className="flex flex-wrap items-center gap-1.5">
        <EditBtn active={mode === "lieu"} color="#54b085" onClick={() => { setMode(mode === "lieu" ? "none" : "lieu"); setRoutePts([]); }}><MapPin className="h-3.5 w-3.5" /> Ajouter un lieu</EditBtn>
        <EditBtn active={mode === "route"} color="#c8a45c" onClick={() => { setMode(mode === "route" ? "none" : "route"); setRoutePts([]); }}><RouteIcon className="h-3.5 w-3.5" /> Tracer un itinéraire</EditBtn>
        <button onClick={() => setFond(true)} className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-[0.74rem] font-semibold text-muted transition hover:border-border-2 hover:text-ink"><ImageIcon className="h-3.5 w-3.5" /> Fond de carte</button>
        {mode !== "none" ? <span className="ml-1 text-[0.74rem] text-faint">{mode === "lieu" ? "Clique sur la carte pour poser le lieu." : `Clique les points du trajet — ${routePts.length} placé(s).`}</span> : null}
      </div>

      {flash ? <div><Flash tone={flash.t === "ok" ? "good" : "bad"}>{flash.m}</Flash></div> : null}

      {/* Filtres par type */}
      <div className="flex flex-wrap items-center gap-1.5">
        {typesPresents.length > 1 ? (
          <button onClick={toggleTous} title={tousActifs ? "Masquer tous les types" : "Afficher tous les types"} className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-[0.74rem] font-semibold text-muted transition hover:border-border-2 hover:text-ink">{tousActifs ? "Tout masquer" : "Tout afficher"}</button>
        ) : null}
        {typesPresents.map((ty) => {
          const on = actifs.has(ty.key);
          const n = points.filter((p) => p.type === ty.key).length;
          return (
            <button key={ty.key} onClick={() => toggle(ty.key)} className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.74rem] font-semibold transition"
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
        onWheel={onWheel} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={onUp} onClick={onMapClick}
        className="relative overflow-hidden rounded-[14px] border border-border-2 select-none"
        style={{ height: "min(72vh, 720px)", cursor: mode !== "none" ? "crosshair" : drag.current ? "grabbing" : "grab", background: "radial-gradient(1200px 700px at 50% -5%, color-mix(in srgb,var(--accent) 7%,transparent), transparent 60%), #16130d", touchAction: "none" }}
      >
        <div className="absolute left-0 top-0 origin-top-left" style={{ transform: `translate(${t.x}px,${t.y}px) scale(${t.z})` }}>
          <div ref={world} className="relative" style={{ width: "min(72vh,720px)", aspectRatio: "1 / 1" }}>
            {img ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={img} alt="Carte" className="absolute inset-0 h-full w-full object-cover" draggable={false} />
            ) : (
              <FondParchemin />
            )}

            {/* Itinéraires (SVG en % du monde) */}
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full">
              {visRoutes.map((r) => {
                const rt = RTYPE(r.type);
                const d = r.points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
                return <path key={r.id} d={d} fill="none" stroke={rt.color} strokeWidth={0.5} strokeDasharray={rt.dash || undefined} strokeLinecap="round" strokeLinejoin="round" opacity={0.9} />;
              })}
              {/* Itinéraire en cours de tracé */}
              {routePts.length ? (
                <>
                  <path d={routePts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ")} fill="none" stroke="var(--accent)" strokeWidth={0.6} strokeDasharray="1.5 1.2" strokeLinecap="round" opacity={0.95} />
                  {routePts.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={0.9} fill="var(--accent)" />)}
                </>
              ) : null}
            </svg>

            {/* Marqueurs */}
            {posPoints.map((p) => {
              const ty = TYPE(p.type);
              const on = sel?.id === p.id;
              return (
                <button key={p.id} title={p.nom}
                  onClick={(e) => { e.stopPropagation(); if (!moved.current && mode === "none") setSel(p); }}
                  className="absolute grid -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border text-[0.7rem] shadow-md transition"
                  style={{ left: `${p.x}%`, top: `${p.y}%`, width: on ? 26 : 22, height: on ? 26 : 22, transform: `translate(-50%,-50%) scale(${1 / t.z})`, background: `color-mix(in srgb,${ty.color} 80%,#000)`, borderColor: on ? "#fff" : p.source === "web" ? "color-mix(in srgb,var(--accent) 70%,#000)" : "color-mix(in srgb,#000 30%,transparent)", zIndex: on ? 20 : 10 }}>
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

        {/* Panneau « tracé en cours » */}
        {mode === "route" ? (
          <div className="absolute left-1/2 top-3 flex -translate-x-1/2 items-center gap-2 rounded-full border border-border-2 bg-surface/95 px-3 py-1.5 text-[0.78rem] shadow-card backdrop-blur">
            <RouteIcon className="h-3.5 w-3.5 text-accent" /> {routePts.length} point(s)
            <button onClick={() => setRoutePts((p) => p.slice(0, -1))} disabled={!routePts.length} className="rounded-md border border-border px-2 py-0.5 text-[0.72rem] text-muted hover:text-ink disabled:opacity-40">Annuler dernier</button>
            <button onClick={() => setRouteDraft(routePts)} disabled={routePts.length < 2} className="rounded-md px-2 py-0.5 text-[0.72rem] font-semibold text-black/85 disabled:opacity-40" style={{ background: "var(--accent)" }}>Terminer</button>
            <button onClick={annulerEdition} className="text-faint hover:text-ink"><X className="h-3.5 w-3.5" /></button>
          </div>
        ) : mode === "lieu" ? (
          <div className="absolute left-1/2 top-3 flex -translate-x-1/2 items-center gap-2 rounded-full border border-border-2 bg-surface/95 px-3 py-1.5 text-[0.78rem] shadow-card backdrop-blur">
            <MapPin className="h-3.5 w-3.5 text-accent" /> Clique l&apos;emplacement du lieu
            <button onClick={annulerEdition} className="text-faint hover:text-ink"><X className="h-3.5 w-3.5" /></button>
          </div>
        ) : null}

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
            <div className="mt-2 flex items-center justify-between">
              <div className="text-[0.7rem] text-faint">{NIVEAU_EMOJI[sel.niveau] || "⚪"} {NIVEAU_LABEL[sel.niveau] || sel.niveau}</div>
              {sel.source === "web" ? (
                <div className="flex items-center gap-1.5">
                  <button onClick={() => { setLieuEdit(sel); }} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[0.72rem] text-muted hover:text-ink"><Pencil className="h-3 w-3" /> Modifier</button>
                  <button onClick={() => retirerLieu(sel.id)} className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[0.72rem]" style={{ color: "var(--oxblood)", borderColor: "color-mix(in srgb,var(--oxblood) 40%,var(--border))" }}><Trash2 className="h-3 w-3" /> Supprimer</button>
                </div>
              ) : <span className="text-[0.66rem] text-faint">depuis Discord</span>}
            </div>
          </div>
        ) : null}
      </div>

      {/* Itinéraires : liste + suppression (web) */}
      {routes.length ? (
        <div className="flex flex-wrap gap-1.5">
          {routes.map((r) => {
            const rt = RTYPE(r.type);
            return (
              <span key={r.id} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-2 px-2.5 py-1 text-[0.74rem]">
                <span className="h-2 w-2 rounded-full" style={{ background: rt.color }} /> {r.nom} <span className="text-faint">{rt.label}</span>
                {r.source === "web" ? <button onClick={() => retirerItineraire(r.id)} className="text-faint hover:text-oxblood" aria-label="Supprimer l'itinéraire"><X className="h-3.5 w-3.5" /></button> : null}
              </span>
            );
          })}
        </div>
      ) : null}

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
                      <span>{TYPE(p.type).emoji}</span><span className="text-ink">{p.nom}</span>{p.lieu ? <span className="truncate text-faint">— {p.lieu}</span> : null}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* Modales */}
      {lieuDraft ? <LieuModal titre="📍 Nouveau lieu" canConf={canConf} onClose={() => setLieuDraft(null)} onSave={(d) => ajouterLieu({ ...d, x: lieuDraft.x, y: lieuDraft.y })} /> : null}
      {lieuEdit ? <LieuModal titre="✏️ Modifier le lieu" canConf={canConf} initial={lieuEdit} onClose={() => setLieuEdit(null)} onSave={(d) => editerLieu(lieuEdit.id, d)} /> : null}
      {routeDraft ? <ItineraireModal canConf={canConf} onClose={() => setRouteDraft(null)} onSave={(d) => ajouterItineraire({ ...d, points: routeDraft })} /> : null}
      {fond ? <FondModal current={img} onClose={() => setFond(false)} onSave={(url) => { setImg(url || null); definirFondCarte(url).then((r) => { if (!r.ok) setFlash({ t: "bad", m: r.error || "Impossible." }); else router.refresh(); }); setFond(false); }} /> : null}
    </div>
  );
}

function EditBtn({ children, active, color, onClick }: { children: React.ReactNode; active: boolean; color: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.74rem] font-semibold transition"
      style={{ borderColor: active ? `color-mix(in srgb,${color} 60%,var(--border))` : "var(--border)", background: active ? `color-mix(in srgb,${color} 18%,transparent)` : "transparent", color: active ? "var(--ink)" : "var(--muted)" }}>
      {children}
    </button>
  );
}

function CtrlBtn({ children, onClick, label }: { children: React.ReactNode; onClick: () => void; label: string }) {
  return (
    <button onClick={onClick} aria-label={label} title={label} className="grid h-9 w-9 place-items-center rounded-lg border border-border-2 bg-surface/90 text-muted backdrop-blur transition hover:text-ink">{children}</button>
  );
}

// ── Modale lieu (création / édition) ────────────────────────────
function LieuModal({ titre, canConf, initial, onClose, onSave }: {
  titre: string; canConf: boolean; initial?: CartePoint; onClose: () => void;
  onSave: (d: { nom: string; type: string; niveau: string; region: string; lieu: string; notes: string }) => void;
}) {
  const [nom, setNom] = useState(initial?.nom || "");
  const [type, setType] = useState(initial?.type || "recolte");
  const [niveau, setNiveau] = useState(initial?.niveau || "public");
  const [region, setRegion] = useState(initial?.region || "");
  const [lieu, setLieu] = useState(initial?.lieu || "");
  const [notes, setNotes] = useState(initial?.notes || "");
  const [err, setErr] = useState<string | null>(null);
  const niveaux = canConf ? ["public", "membre", "confidentiel"] : ["public", "membre"];

  function go() {
    if (nom.trim().length < 1) { setErr("Donne un nom au lieu."); return; }
    onSave({ nom: nom.trim(), type, niveau, region, lieu, notes });
  }
  return (
    <Modal titre={titre} onClose={onClose} max={460}>
      <div className="flex flex-col gap-3">
        <Champ label="Nom du lieu *"><input className={inputCls} value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Point de récolte, planque, vendeur…" maxLength={120} autoFocus /></Champ>
        <div className="flex flex-col gap-1"><span className="text-[0.72rem] uppercase tracking-[0.05em] text-faint">Type</span>
          <select value={type} onChange={(e) => setType(e.target.value)} className={inputCls}>{TYPES.map((ty) => <option key={ty.key} value={ty.key}>{ty.emoji} {ty.label}</option>)}</select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-1"><span className="text-[0.72rem] uppercase tracking-[0.05em] text-faint">Région</span>
            <select value={region} onChange={(e) => setRegion(e.target.value)} className={inputCls}><option value="">—</option>{REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}</select>
          </div>
          <div className="flex flex-col gap-1"><span className="text-[0.72rem] uppercase tracking-[0.05em] text-faint">Visibilité</span>
            <select value={niveau} onChange={(e) => setNiveau(e.target.value)} className={inputCls}>{niveaux.map((n) => <option key={n} value={n}>{NIVEAU_EMOJI[n]} {NIVEAU_LABEL[n]}</option>)}</select>
          </div>
        </div>
        <Champ label="Lieu-dit / repère (optionnel)"><input className={inputCls} value={lieu} onChange={(e) => setLieu(e.target.value)} placeholder="Au nord de Valentine…" maxLength={200} /></Champ>
        <Champ label="Notes (optionnel)"><textarea className={inputCls} value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={1000} placeholder="Détails, horaires, contact…" /></Champ>
        {err ? <p className="text-[0.8rem]" style={{ color: "var(--oxblood)" }}>{err}</p> : null}
        <div className="mt-1 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-border bg-surface-2 px-3.5 py-2 text-[0.82rem] font-semibold hover:border-border-2">Annuler</button>
          <button onClick={go} className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[0.82rem] font-semibold text-black/85" style={{ background: "var(--accent)" }}><Check className="h-3.5 w-3.5" /> Enregistrer</button>
        </div>
      </div>
    </Modal>
  );
}

// ── Modale itinéraire (finalisation) ────────────────────────────
function ItineraireModal({ canConf, onClose, onSave }: { canConf: boolean; onClose: () => void; onSave: (d: { nom: string; type: string; niveau: string; notes: string }) => void }) {
  const [nom, setNom] = useState("");
  const [type, setType] = useState("routine");
  const [niveau, setNiveau] = useState("public");
  const [notes, setNotes] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const niveaux = canConf ? ["public", "membre", "confidentiel"] : ["public", "membre"];
  function go() { if (nom.trim().length < 1) { setErr("Donne un nom à l'itinéraire."); return; } onSave({ nom: nom.trim(), type, niveau, notes }); }
  return (
    <Modal titre="🛣️ Nouvel itinéraire" onClose={onClose} max={440}>
      <div className="flex flex-col gap-3">
        <Champ label="Nom de l'itinéraire *"><input className={inputCls} value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Approche du convoi, repli d'urgence…" maxLength={120} autoFocus /></Champ>
        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-1"><span className="text-[0.72rem] uppercase tracking-[0.05em] text-faint">Type</span>
            <select value={type} onChange={(e) => setType(e.target.value)} className={inputCls}>{ROUTE_TYPES.map((ty) => <option key={ty.key} value={ty.key}>{ty.label}</option>)}</select>
          </div>
          <div className="flex flex-col gap-1"><span className="text-[0.72rem] uppercase tracking-[0.05em] text-faint">Visibilité</span>
            <select value={niveau} onChange={(e) => setNiveau(e.target.value)} className={inputCls}>{niveaux.map((n) => <option key={n} value={n}>{NIVEAU_EMOJI[n]} {NIVEAU_LABEL[n]}</option>)}</select>
          </div>
        </div>
        <Champ label="Notes (optionnel)"><textarea className={inputCls} value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={1000} /></Champ>
        {err ? <p className="text-[0.8rem]" style={{ color: "var(--oxblood)" }}>{err}</p> : null}
        <div className="mt-1 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-border bg-surface-2 px-3.5 py-2 text-[0.82rem] font-semibold hover:border-border-2">Annuler</button>
          <button onClick={go} className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[0.82rem] font-semibold text-black/85" style={{ background: "var(--accent)" }}><Check className="h-3.5 w-3.5" /> Enregistrer</button>
        </div>
      </div>
    </Modal>
  );
}

// ── Modale fond de carte ────────────────────────────────────────
function FondModal({ current, onClose, onSave }: { current: string | null; onClose: () => void; onSave: (url: string) => void }) {
  const [url, setUrl] = useState("");
  return (
    <Modal titre="🖼️ Fond de carte" onClose={onClose} max={460}>
      <div className="flex flex-col gap-3">
        <p className="text-[0.82rem] text-muted">Choisis l&apos;image de la carte RDR2 utilisée sur Discord (les repères se placent par-dessus). Glisse un fichier, ou colle une URL. Les grandes images sont réduites automatiquement.</p>
        <PhotoDrop dossier="carte" maxDim={3000} camera={false} onUploaded={(u) => onSave(u)} label="Glisse l'image de la carte" />
        <div className="flex items-center gap-2">
          <input className={inputCls} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="…ou colle une URL https://…" />
          <button onClick={() => url && onSave(url)} disabled={!/^https?:\/\//.test(url)} className="shrink-0 rounded-lg px-3 py-2 text-[0.8rem] font-semibold text-black/85 disabled:opacity-40" style={{ background: "var(--accent)" }}>Utiliser</button>
        </div>
        {current ? <button onClick={() => onSave("")} className="self-start text-[0.78rem] text-faint hover:text-oxblood">Retirer le fond actuel</button> : null}
      </div>
    </Modal>
  );
}

// Fond « parchemin » stylisé : tant qu'aucune vraie image de carte n'est définie.
function FondParchemin() {
  return (
    <div className="absolute inset-0" style={{ background: "radial-gradient(120% 120% at 30% 20%, #2b2417, #1c1710 55%, #14100a)" }}>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
        <defs><pattern id="grid" width="10" height="10" patternUnits="userSpaceOnUse"><path d="M10 0 L0 0 0 10" fill="none" stroke="#c8a45c" strokeWidth="0.15" opacity="0.18" /></pattern></defs>
        <rect width="100" height="100" fill="url(#grid)" />
        <rect x="2" y="2" width="96" height="96" fill="none" stroke="#c8a45c" strokeWidth="0.4" opacity="0.35" />
        <rect x="3.4" y="3.4" width="93.2" height="93.2" fill="none" stroke="#c8a45c" strokeWidth="0.15" opacity="0.25" />
      </svg>
      {[{ r: "Ambarino", x: 62, y: 16 }, { r: "New Hanover", x: 62, y: 42 }, { r: "Lemoyne", x: 74, y: 74 }, { r: "West Elizabeth", x: 30, y: 50 }, { r: "New Austin", x: 20, y: 80 }].map((z) => (
        <span key={z.r} className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 font-display uppercase tracking-[0.14em]" style={{ left: `${z.x}%`, top: `${z.y}%`, color: "color-mix(in srgb,var(--accent) 55%,transparent)", fontSize: "clamp(9px,1.4vw,15px)" }}>{z.r}</span>
      ))}
      <span className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 font-display italic" style={{ color: "color-mix(in srgb,var(--accent) 22%,transparent)", fontSize: "clamp(10px,1.6vw,16px)" }}>Territoire de la Compagnie</span>
    </div>
  );
}
