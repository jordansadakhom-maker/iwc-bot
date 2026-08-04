"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  LayoutGrid, X, GripVertical, StickyNote, Clock, Timer, ListChecks, Compass,
  Calculator, Dices, Plus, Play, Pause, RotateCcw, Trash2, Check, Delete,
  type LucideIcon,
} from "lucide-react";

// ────────────────────────────────────────────────────────────────────────────
// WIDGETS FLOTTANTS — présents sur TOUTES les pages internes (monté dans Shell).
// Un lanceur ouvre une palette ; chaque widget est une petite fiche que l'on
// DÉPLACE librement (glisser l'en-tête), ferme, et dont la position + l'état
// « ouvert » sont mémorisés dans le navigateur (localStorage, préférence locale).
// Aucune donnée serveur : ce sont des outils autonomes (bloc-notes, horloge,
// minuteur, aide-mémoire, liens, calculatrice, dés) utilisables de partout.
// ────────────────────────────────────────────────────────────────────────────

type XY = { x: number; y: number };
type Layout = { open: string[]; pos: Record<string, XY> };
const CLE = "iwc.widgets.v1";

type WidgetDef = { id: string; nom: string; icon: LucideIcon; w: number };
const WIDGETS: WidgetDef[] = [
  { id: "notes", nom: "Bloc-notes", icon: StickyNote, w: 264 },
  { id: "horloge", nom: "Horloge", icon: Clock, w: 234 },
  { id: "minuteur", nom: "Minuteur", icon: Timer, w: 244 },
  { id: "checklist", nom: "Aide-mémoire", icon: ListChecks, w: 268 },
  { id: "liens", nom: "Liens rapides", icon: Compass, w: 258 },
  { id: "calc", nom: "Calculatrice", icon: Calculator, w: 236 },
  { id: "des", nom: "Lancer de dés", icon: Dices, w: 236 },
];
const DEF = (id: string) => WIDGETS.find((w) => w.id === id);

function lire(): Layout {
  try {
    const raw = localStorage.getItem(CLE);
    if (raw) {
      const p = JSON.parse(raw) as Partial<Layout>;
      if (Array.isArray(p.open) && p.pos && typeof p.pos === "object") {
        return { open: p.open.filter((id) => !!DEF(id)), pos: p.pos as Record<string, XY> };
      }
    }
  } catch { /* ignore */ }
  return { open: [], pos: {} };
}

// Garde une fiche visible dans la fenêtre (au moins un bord accessible).
function borner(p: XY, w = 240, h = 160): XY {
  if (typeof window === "undefined") return p;
  const maxX = Math.max(8, window.innerWidth - w - 8);
  const maxY = Math.max(8, window.innerHeight - h - 8);
  return { x: Math.min(Math.max(8, p.x), maxX), y: Math.min(Math.max(8, p.y), maxY) };
}

export function WidgetsFlottants() {
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState<string[]>([]);
  const [pos, setPos] = useState<Record<string, XY>>({});
  const [palette, setPalette] = useState(false);

  // Chargement de la disposition mémorisée (après montage → pas de mismatch SSR).
  useEffect(() => {
    const l = lire();
    setOpen(l.open);
    setPos(l.pos);
    setMounted(true);
  }, []);

  // Sauvegarde à chaque changement (une fois monté).
  useEffect(() => {
    if (!mounted) return;
    try { localStorage.setItem(CLE, JSON.stringify({ open, pos })); } catch { /* ignore */ }
  }, [mounted, open, pos]);

  // Reste dans le cadre quand la fenêtre est redimensionnée.
  useEffect(() => {
    if (!mounted) return;
    const onResize = () => setPos((p) => {
      const n: Record<string, XY> = {};
      for (const id of Object.keys(p)) n[id] = borner(p[id], DEF(id)?.w);
      return n;
    });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [mounted]);

  const focus = useCallback((id: string) => {
    setOpen((o) => (o[o.length - 1] === id ? o : [...o.filter((x) => x !== id), id]));
  }, []);

  const ouvrir = useCallback((id: string) => {
    setOpen((o) => {
      if (o.includes(id)) return [...o.filter((x) => x !== id), id];
      return [...o, id];
    });
    setPos((p) => {
      if (p[id]) return p;
      const n = Object.keys(p).length;
      return { ...p, [id]: borner({ x: 132 + n * 26, y: 96 + n * 26 }, DEF(id)?.w) };
    });
    setPalette(false);
  }, []);

  const fermer = useCallback((id: string) => setOpen((o) => o.filter((x) => x !== id)), []);
  const deplacer = useCallback((id: string, xy: XY) => setPos((p) => ({ ...p, [id]: xy })), []);

  if (!mounted) {
    // Lanceur seul au premier rendu (état déterministe, pas de position dynamique).
    return <Lanceur nOpen={0} palette={false} setPalette={setPalette} ouvrir={ouvrir} open={[]} />;
  }

  return (
    <>
      {open.map((id, i) => {
        const def = DEF(id);
        if (!def) return null;
        return (
          <Fiche
            key={id}
            def={def}
            pos={pos[id] || { x: 132, y: 96 }}
            z={30 + Math.min(i, 8)}
            onMove={(xy) => deplacer(id, xy)}
            onClose={() => fermer(id)}
            onFocus={() => focus(id)}
          />
        );
      })}
      <Lanceur nOpen={open.length} palette={palette} setPalette={setPalette} ouvrir={ouvrir} open={open} />
    </>
  );
}

// ── Lanceur + palette ───────────────────────────────────────────────────────
function Lanceur({
  nOpen, palette, setPalette, ouvrir, open,
}: {
  nOpen: number; palette: boolean; setPalette: (v: boolean) => void;
  ouvrir: (id: string) => void; open: string[];
}) {
  return (
    <div className="fixed bottom-[5.75rem] right-5 z-40 flex flex-col items-end gap-2 print:hidden">
      {palette ? (
        <div className="iwc-pop w-[248px] rounded-2xl border border-border-2 bg-surface p-2.5 shadow-2xl">
          <div className="mb-1.5 flex items-center justify-between px-1">
            <span className="text-[0.8rem] font-semibold tracking-wide">Widgets</span>
            <button onClick={() => setPalette(false)} className="text-faint hover:text-ink"><X className="h-4 w-4" /></button>
          </div>
          <div className="grid grid-cols-1 gap-1">
            {WIDGETS.map((w) => {
              const actif = open.includes(w.id);
              const Ic = w.icon;
              return (
                <button
                  key={w.id}
                  onClick={() => ouvrir(w.id)}
                  className="flex items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left text-[0.82rem] transition"
                  style={actif
                    ? { borderColor: "color-mix(in srgb,var(--accent) 45%,var(--border))", background: "color-mix(in srgb,var(--accent) 12%,var(--surface))" }
                    : { borderColor: "var(--border)", background: "var(--surface-2)" }}
                >
                  <Ic className="h-4 w-4 shrink-0 text-accent" />
                  <span className="flex-1 font-medium">{w.nom}</span>
                  {actif ? <Check className="h-3.5 w-3.5 text-accent" /> : <Plus className="h-3.5 w-3.5 text-faint" />}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <button
        onClick={() => setPalette(!palette)}
        title="Widgets déplaçables"
        className="relative grid h-14 w-14 place-items-center rounded-full text-black/85 shadow-2xl transition hover:scale-105"
        style={{ background: "linear-gradient(180deg,var(--accent-hi),var(--accent))" }}
      >
        <LayoutGrid className="h-6 w-6" />
        {nOpen > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full border-2 border-surface bg-oxblood px-1 text-[0.66rem] font-bold text-white" style={{ background: "var(--oxblood)" }}>{nOpen}</span>
        ) : null}
      </button>
    </div>
  );
}

// ── Fiche (cadre déplaçable) ──────────────────────────────────────────────────
function Fiche({
  def, pos, z, onMove, onClose, onFocus,
}: {
  def: WidgetDef; pos: XY; z: number;
  onMove: (xy: XY) => void; onClose: () => void; onFocus: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const off = useRef<XY>({ x: 0, y: 0 });
  const [drag, setDrag] = useState(false);
  const Ic = def.icon;

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    onFocus();
    setDrag(true);
    off.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
    const rect = ref.current;
    const move = (ev: PointerEvent) => {
      const w = rect?.offsetWidth ?? def.w;
      const h = rect?.offsetHeight ?? 160;
      onMove(borner({ x: ev.clientX - off.current.x, y: ev.clientY - off.current.y }, w, h));
    };
    const up = () => {
      setDrag(false);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return (
    <div
      ref={ref}
      onPointerDown={onFocus}
      className="fixed rounded-2xl border border-border-2 bg-surface shadow-2xl print:hidden"
      style={{
        left: pos.x, top: pos.y, width: def.w, zIndex: z,
        boxShadow: "0 18px 50px -14px rgba(0,0,0,.6), 0 0 0 1px color-mix(in srgb,var(--accent) 10%,transparent)",
      }}
    >
      <div
        onPointerDown={onPointerDown}
        className={`flex items-center gap-2 rounded-t-2xl border-b border-border px-2.5 py-2 select-none ${drag ? "cursor-grabbing" : "cursor-grab"}`}
        style={{ background: "linear-gradient(180deg,var(--surface-2),color-mix(in srgb,var(--surface-2) 80%,#000))" }}
      >
        <GripVertical className="h-4 w-4 shrink-0 text-faint" />
        <Ic className="h-4 w-4 shrink-0 text-accent" />
        <span className="flex-1 truncate text-[0.8rem] font-semibold tracking-wide">{def.nom}</span>
        <button onClick={onClose} title="Fermer" className="shrink-0 rounded-md p-0.5 text-faint transition hover:bg-surface hover:text-oxblood"><X className="h-4 w-4" /></button>
      </div>
      <div className="p-3">
        <Contenu id={def.id} />
      </div>
    </div>
  );
}

function Contenu({ id }: { id: string }) {
  switch (id) {
    case "notes": return <WNotes />;
    case "horloge": return <WHorloge />;
    case "minuteur": return <WMinuteur />;
    case "checklist": return <WChecklist />;
    case "liens": return <WLiens />;
    case "calc": return <WCalc />;
    case "des": return <WDes />;
    default: return null;
  }
}

// ── Widget : Bloc-notes ───────────────────────────────────────────────────────
function WNotes() {
  const [txt, setTxt] = useState("");
  useEffect(() => { try { setTxt(localStorage.getItem("iwc.widget.notes") || ""); } catch { /* ignore */ } }, []);
  const change = (v: string) => { setTxt(v); try { localStorage.setItem("iwc.widget.notes", v); } catch { /* ignore */ } };
  return (
    <textarea
      value={txt}
      onChange={(e) => change(e.target.value)}
      placeholder="Notes rapides… (mémorisées ici)"
      className="min-h-[120px] w-full resize-y rounded-lg border border-border bg-surface-2 px-2.5 py-2 text-[0.82rem] leading-relaxed text-ink outline-none placeholder:text-faint"
      style={{ maxHeight: 360 }}
    />
  );
}

// ── Widget : Horloge ──────────────────────────────────────────────────────────
function WHorloge() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const h = now
    ? now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : "--:--:--";
  const d = now
    ? now.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
    : "";
  return (
    <div className="text-center">
      <div className="font-mono text-[1.9rem] font-bold tracking-[0.08em] text-accent tabular-nums">{h}</div>
      <div className="mt-1 text-[0.76rem] capitalize text-muted">{d}</div>
    </div>
  );
}

// ── Widget : Minuteur ─────────────────────────────────────────────────────────
function bip() {
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.type = "sine"; o.frequency.value = 880; o.connect(g); g.connect(ctx.destination);
    g.gain.setValueAtTime(0.001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.7);
    o.start(); o.stop(ctx.currentTime + 0.72);
    o.onended = () => { try { ctx.close(); } catch { /* ignore */ } };
  } catch { /* ignore */ }
}
function WMinuteur() {
  const [reste, setReste] = useState(0);     // secondes restantes
  const [actif, setActif] = useState(false);
  const [sonne, setSonne] = useState(false);
  useEffect(() => {
    if (!actif) return;
    const id = window.setInterval(() => {
      setReste((r) => {
        if (r <= 1) { setActif(false); setSonne(true); bip(); return 0; }
        return r - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [actif]);
  const ajoute = (s: number) => { setSonne(false); setReste((r) => Math.min(r + s, 5999)); };
  const mm = String(Math.floor(reste / 60)).padStart(2, "0");
  const ss = String(reste % 60).padStart(2, "0");
  return (
    <div className="text-center">
      <div className={`font-mono text-[2rem] font-bold tabular-nums ${sonne ? "text-oxblood" : reste ? "text-ink" : "text-faint"}`}>{mm}:{ss}</div>
      <div className="mt-1.5 flex justify-center gap-1.5">
        {[["+1", 60], ["+5", 300], ["+10", 600]].map(([l, s]) => (
          <button key={l} onClick={() => ajoute(s as number)} className="rounded-md border border-border bg-surface-2 px-2 py-1 text-[0.72rem] font-semibold transition hover:border-accent">{l as string}</button>
        ))}
      </div>
      <div className="mt-2 flex justify-center gap-1.5">
        <button
          onClick={() => { if (reste > 0) { setSonne(false); setActif((a) => !a); } }}
          disabled={reste === 0}
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[0.78rem] font-semibold text-black/85 transition disabled:opacity-40"
          style={{ background: "linear-gradient(180deg,var(--accent-hi),var(--accent))" }}
        >
          {actif ? <><Pause className="h-3.5 w-3.5" /> Pause</> : <><Play className="h-3.5 w-3.5" /> Démarrer</>}
        </button>
        <button onClick={() => { setActif(false); setReste(0); setSonne(false); }} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[0.78rem] font-semibold transition hover:border-accent"><RotateCcw className="h-3.5 w-3.5" /></button>
      </div>
    </div>
  );
}

// ── Widget : Aide-mémoire (checklist) ────────────────────────────────────────
type Tache = { id: string; t: string; fait: boolean };
function WChecklist() {
  const [items, setItems] = useState<Tache[]>([]);
  const [txt, setTxt] = useState("");
  useEffect(() => {
    try { const r = localStorage.getItem("iwc.widget.todo"); if (r) setItems(JSON.parse(r)); } catch { /* ignore */ }
  }, []);
  const sauver = (n: Tache[]) => { setItems(n); try { localStorage.setItem("iwc.widget.todo", JSON.stringify(n)); } catch { /* ignore */ } };
  const ajouter = () => {
    const t = txt.trim(); if (!t) return;
    sauver([...items, { id: `${items.length}-${t.slice(0, 6)}-${items.reduce((a, x) => a + x.t.length, 0)}`, t, fait: false }]);
    setTxt("");
  };
  const toggle = (id: string) => sauver(items.map((x) => (x.id === id ? { ...x, fait: !x.fait } : x)));
  const retirer = (id: string) => sauver(items.filter((x) => x.id !== id));
  const restants = items.filter((x) => !x.fait).length;
  return (
    <div>
      <div className="flex gap-1.5">
        <input
          value={txt}
          onChange={(e) => setTxt(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") ajouter(); }}
          placeholder="Ajouter une tâche…"
          maxLength={120}
          className="min-w-0 flex-1 rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-[0.8rem] text-ink outline-none placeholder:text-faint"
        />
        <button onClick={ajouter} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-black/85" style={{ background: "linear-gradient(180deg,var(--accent-hi),var(--accent))" }}><Plus className="h-4 w-4" /></button>
      </div>
      <ul className="mt-2 flex max-h-[220px] flex-col gap-1 overflow-auto">
        {items.length === 0 ? (
          <li className="py-3 text-center text-[0.76rem] text-faint">Aucune tâche.</li>
        ) : items.map((x) => (
          <li key={x.id} className="group flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-2 py-1.5">
            <button onClick={() => toggle(x.id)} className="grid h-4 w-4 shrink-0 place-items-center rounded border transition" style={x.fait ? { background: "var(--accent)", borderColor: "var(--accent)" } : { borderColor: "var(--border-2)" }}>
              {x.fait ? <Check className="h-3 w-3 text-black/80" /> : null}
            </button>
            <span className={`flex-1 truncate text-[0.8rem] ${x.fait ? "text-faint line-through" : "text-ink"}`}>{x.t}</span>
            <button onClick={() => retirer(x.id)} className="shrink-0 text-faint opacity-0 transition hover:text-oxblood group-hover:opacity-100"><Trash2 className="h-3.5 w-3.5" /></button>
          </li>
        ))}
      </ul>
      {items.length > 0 ? <div className="mt-1.5 text-right text-[0.7rem] text-faint">{restants} restante{restants > 1 ? "s" : ""}</div> : null}
    </div>
  );
}

// ── Widget : Liens rapides ────────────────────────────────────────────────────
const LIENS = [
  { href: "/dashboard", l: "Tableau" },
  { href: "/membres", l: "Membres" },
  { href: "/operations", l: "Opérations" },
  { href: "/taches", l: "Tâches" },
  { href: "/finances", l: "Finances" },
  { href: "/medical", l: "Dispensaire" },
  { href: "/notifications", l: "Notifs" },
  { href: "/agenda", l: "Agenda" },
];
function WLiens() {
  return (
    <div className="grid grid-cols-2 gap-1.5">
      {LIENS.map((x) => (
        <Link key={x.href} href={x.href} className="rounded-lg border border-border bg-surface-2 px-2.5 py-2 text-center text-[0.78rem] font-medium text-ink transition hover:border-accent hover:text-accent">{x.l}</Link>
      ))}
    </div>
  );
}

// ── Widget : Calculatrice ─────────────────────────────────────────────────────
function WCalc() {
  const [disp, setDisp] = useState("0");
  const [acc, setAcc] = useState<number | null>(null);
  const [op, setOp] = useState<string | null>(null);
  const [neuf, setNeuf] = useState(true);   // prochaine touche = nouveau nombre

  const calcule = (a: number, b: number, o: string) =>
    o === "+" ? a + b : o === "−" ? a - b : o === "×" ? a * b : o === "÷" ? (b === 0 ? NaN : a / b) : b;

  const chiffre = (c: string) => {
    if (neuf) { setDisp(c === "." ? "0." : c); setNeuf(false); return; }
    if (c === "." && disp.includes(".")) return;
    setDisp(disp.length < 12 ? disp + c : disp);
  };
  const operateur = (o: string) => {
    const cur = parseFloat(disp);
    if (acc !== null && op && !neuf) {
      const r = calcule(acc, cur, op);
      setAcc(r); setDisp(fmt(r));
    } else { setAcc(cur); }
    setOp(o); setNeuf(true);
  };
  const egale = () => {
    if (acc === null || !op) return;
    const r = calcule(acc, parseFloat(disp), op);
    setDisp(fmt(r)); setAcc(null); setOp(null); setNeuf(true);
  };
  const clear = () => { setDisp("0"); setAcc(null); setOp(null); setNeuf(true); };
  const efface = () => { if (neuf) return; setDisp((d) => (d.length <= 1 ? "0" : d.slice(0, -1))); };
  const fmt = (n: number) => (Number.isNaN(n) || !Number.isFinite(n)) ? "Erreur" : String(Math.round(n * 1e6) / 1e6);

  const T = ({ v, on, style, span }: { v: React.ReactNode; on: () => void; style?: React.CSSProperties; span?: boolean }) => (
    <button onClick={on} className={`rounded-lg border border-border bg-surface-2 py-2 text-[0.9rem] font-semibold transition hover:border-accent ${span ? "col-span-2" : ""}`} style={style}>{v}</button>
  );
  const opStyle = (o: string): React.CSSProperties => op === o ? { background: "var(--accent)", color: "#000", borderColor: "var(--accent)" } : { color: "var(--accent)" };

  return (
    <div>
      <div className="mb-2 truncate rounded-lg border border-border bg-bg-2 px-3 py-2 text-right font-mono text-[1.2rem] font-bold text-ink tabular-nums">{disp}</div>
      <div className="grid grid-cols-4 gap-1.5">
        <T v="C" on={clear} style={{ color: "var(--oxblood)" }} />
        <T v={<Delete className="mx-auto h-4 w-4" />} on={efface} />
        <T v="÷" on={() => operateur("÷")} style={opStyle("÷")} />
        <T v="×" on={() => operateur("×")} style={opStyle("×")} />
        {["7", "8", "9"].map((c) => <T key={c} v={c} on={() => chiffre(c)} />)}
        <T v="−" on={() => operateur("−")} style={opStyle("−")} />
        {["4", "5", "6"].map((c) => <T key={c} v={c} on={() => chiffre(c)} />)}
        <T v="+" on={() => operateur("+")} style={opStyle("+")} />
        {["1", "2", "3"].map((c) => <T key={c} v={c} on={() => chiffre(c)} />)}
        <button onClick={egale} className="row-span-2 rounded-lg py-2 text-[1rem] font-bold text-black/85 transition hover:brightness-110" style={{ background: "linear-gradient(180deg,var(--accent-hi),var(--accent))" }}>=</button>
        <T v="0" on={() => chiffre("0")} span />
        <T v="." on={() => chiffre(".")} />
      </div>
    </div>
  );
}

// ── Widget : Lancer de dés ────────────────────────────────────────────────────
function WDes() {
  const [faces, setFaces] = useState(6);
  const [val, setVal] = useState<number | null>(null);
  const [roule, setRoule] = useState(false);
  const lancer = () => {
    setRoule(true);
    let n = 0;
    const id = window.setInterval(() => {
      setVal(Math.floor(Math.random() * faces) + 1);
      if (++n >= 8) { window.clearInterval(id); setRoule(false); }
    }, 55);
  };
  return (
    <div className="text-center">
      <div className="mb-2 flex justify-center gap-1.5">
        {[6, 20, 100].map((f) => (
          <button key={f} onClick={() => { setFaces(f); setVal(null); }} className="rounded-md border px-2.5 py-1 text-[0.74rem] font-semibold transition" style={faces === f ? { background: "var(--accent)", color: "#000", borderColor: "var(--accent)" } : { borderColor: "var(--border)", color: "var(--muted)" }}>d{f}</button>
        ))}
      </div>
      <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl border border-border-2 font-mono text-[1.9rem] font-bold text-accent tabular-nums" style={{ background: "radial-gradient(circle at 30% 25%, color-mix(in srgb,var(--accent) 22%,transparent), transparent 70%), var(--surface-2)" }}>
        {val ?? "—"}
      </div>
      <button onClick={lancer} disabled={roule} className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[0.8rem] font-semibold text-black/85 transition disabled:opacity-50" style={{ background: "linear-gradient(180deg,var(--accent-hi),var(--accent))" }}>
        <Dices className="h-4 w-4" /> Lancer
      </button>
    </div>
  );
}
