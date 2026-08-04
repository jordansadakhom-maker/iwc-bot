"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Shield, ShieldCheck, Footprints, Eye, EyeOff, Crosshair, MapPin, Truck, Coins, Swords,
  Lock, ScrollText, Flame, FileText, Ghost, ChevronRight, ChevronLeft, Save, Printer,
  AlertTriangle, Loader2, Check, Radio, Landmark, Users, Wrench, CalendarClock, Wallet,
  ClipboardCheck, CloudSun, Bold, Italic, Underline, List, ListOrdered, Plus, Minus, X,
  RotateCcw, Route, Clock, FileSignature, Car,
} from "lucide-react";
import type { MembreLite } from "@/lib/queries";
import { creerOperation } from "@/app/(app)/operations/actions";
import { toastErreur } from "@/lib/toast";

// ═══════════════════════════════════════════════════════════════════════════
//  Assistant de création d'opération — « Dossier opérationnel 1904 » vivant.
//  Chrome sombre (charbon / laiton, thème IWC) + dossier parchemin qui se remplit
//  en temps réel. Persistance : blob `dossier` sur l'opération (comme `contrat`).
// ═══════════════════════════════════════════════════════════════════════════

type Dossier = {
  titre: string; codeOp: string; nomRadio: string; type: string; confidentialite: string; menace: string;
  objectif: string; objectifsSecondaires: string; description: string; commanditaire: string; financeur: string;
  pole: string; responsable: string; second: string; chefMedical: string; chefSecurite: string;
  agents: string; invites: string; vehicules: string; vehiculeEtat: string; equipement: string[];
  terrain: string; lieuDepart: string; destination: string; itineraire: string; distance: string; duree: string; zoneDangereuse: boolean;
  phase: string; dateDebut: string; heureDebut: string; dateFin: string; heureFin: string; meteo: string; pointRassemblement: string; heureBriefing: string; notesLogistiques: string;
  primeGlobale: string; primeIndividuelle: string; bonus: string; partageButin: string;
  consignes: string; ordreFeu: string; gestionCivils: string; gestionBlesses: string; planSecours: string; extraction: string; comRadio: string;
};

const VIDE: Dossier = {
  titre: "", codeOp: "", nomRadio: "", type: "escorte", confidentialite: "confidentiel", menace: "modere",
  objectif: "", objectifsSecondaires: "", description: "", commanditaire: "", financeur: "",
  pole: "legal", responsable: "", second: "", chefMedical: "", chefSecurite: "",
  agents: "", invites: "", vehicules: "", vehiculeEtat: "", equipement: [],
  terrain: "", lieuDepart: "", destination: "", itineraire: "", distance: "", duree: "", zoneDangereuse: false,
  phase: "preparation", dateDebut: "", heureDebut: "", dateFin: "", heureFin: "", meteo: "", pointRassemblement: "", heureBriefing: "", notesLogistiques: "",
  primeGlobale: "", primeIndividuelle: "", bonus: "", partageButin: "",
  consignes: "", ordreFeu: "", gestionCivils: "", gestionBlesses: "", planSecours: "", extraction: "", comRadio: "",
};

const TYPES: { key: string; label: string; icon: typeof Shield; diff: number }[] = [
  { key: "escorte", label: "Escorte", icon: Shield, diff: 2 },
  { key: "protection", label: "Protection rapprochée", icon: ShieldCheck, diff: 3 },
  { key: "patrouille", label: "Patrouille", icon: Footprints, diff: 1 },
  { key: "reconnaissance", label: "Reconnaissance", icon: Eye, diff: 2 },
  { key: "chasse", label: "Chasse à l'homme", icon: Crosshair, diff: 4 },
  { key: "localisation", label: "Localisation", icon: MapPin, diff: 2 },
  { key: "extraction", label: "Extraction", icon: Truck, diff: 4 },
  { key: "transport", label: "Transport", icon: Truck, diff: 2 },
  { key: "prime", label: "Prime", icon: Coins, diff: 3 },
  { key: "intervention", label: "Intervention", icon: Swords, diff: 4 },
  { key: "securisation", label: "Sécurisation", icon: Lock, diff: 2 },
  { key: "infiltration", label: "Infiltration", icon: Ghost, diff: 4 },
  { key: "renseignement", label: "Renseignement", icon: ScrollText, diff: 3 },
  { key: "sabotage", label: "Sabotage", icon: Flame, diff: 5 },
  { key: "surveillance", label: "Surveillance", icon: EyeOff, diff: 2 },
  { key: "autre", label: "Autre", icon: FileText, diff: 1 },
];
const typeInfo = (k: string) => TYPES.find((t) => t.key === k) || TYPES[0];

const MENACES: { key: string; label: string; tone: string; pips: number; agents: number }[] = [
  { key: "tres_faible", label: "Très faible", tone: "var(--good)", pips: 1, agents: 1 },
  { key: "faible", label: "Faible", tone: "var(--good)", pips: 2, agents: 2 },
  { key: "modere", label: "Modéré", tone: "var(--warn)", pips: 3, agents: 3 },
  { key: "eleve", label: "Élevé", tone: "#c9791f", pips: 4, agents: 4 },
  { key: "critique", label: "Critique", tone: "var(--oxblood)", pips: 5, agents: 6 },
  { key: "extreme", label: "Extrême", tone: "var(--crit)", pips: 6, agents: 8 },
];
const menaceInfo = (k: string) => MENACES.find((m) => m.key === k) || MENACES[2];

const CONFIDS: { key: string; label: string; tampon: string | null }[] = [
  { key: "public", label: "Public", tampon: null },
  { key: "interne", label: "Interne", tampon: "INTERNE" },
  { key: "confidentiel", label: "Confidentiel", tampon: "CONFIDENTIEL" },
  { key: "secret", label: "Secret", tampon: "SECRET" },
  { key: "top_secret", label: "Top Secret", tampon: "TOP SECRET" },
];
const confidInfo = (k: string) => CONFIDS.find((c) => c.key === k) || CONFIDS[2];

const EQUIPEMENTS = [
  "Fusils", "Revolvers", "Munitions", "Gilets renforcés", "Trousse médicale", "Vivres", "Eau", "Lanterne",
  "Cordes", "Jumelles", "Explosifs", "Chevaux", "Chariots", "Diligence", "Coffre sécurisé", "Documents", "Contrats",
];
const TERRAINS = ["Plaine", "Forêt", "Montagne", "Ville", "Marais", "Désert", "Train", "Bateau"];
const METEOS = ["Dégagé", "Variable", "Pluie", "Orage", "Brouillard", "Neige", "Nuit"];
const PHASES = [{ key: "preparation", label: "Préparation" }, { key: "en_cours", label: "En cours" }, { key: "terminee", label: "Terminée" }];

const ETAPES = [
  { n: 1, label: "Informations", sous: "Détails de la mission" },
  { n: 2, label: "Ressources", sous: "Équipes & matériel" },
  { n: 3, label: "Logistique", sous: "Terrain & planification" },
  { n: 4, label: "Rémunération", sous: "Paiements & primes" },
  { n: 5, label: "Validation", sous: "Aperçu & confirmation" },
];

const money = (v: string) => { const n = Number(String(v).replace(/[^\d.-]/g, "")); return Number.isFinite(n) && n !== 0 ? `$${n.toLocaleString("fr-FR")}` : (String(v).trim() || "—"); };
const nombre = (v: string) => Number(String(v).replace(/[^\d.-]/g, "")) || 0;
const genCode = () => `OP-${String(Math.floor(100 + Math.random() * 900))}`;
const DRAFT_KEY = "iwc-op-dossier-draft-v1";

const inputCls = "w-full rounded-[9px] border border-border bg-surface-2 px-3 py-2 text-[0.86rem] text-ink outline-none placeholder:text-faint focus:border-[color-mix(in_srgb,var(--accent)_55%,var(--border))]";

// ── Mise en forme « légère » (robuste, 100 % texte brut) ─────────────────────
// La description est stockée en clair (markdown-lite). On échappe TOUJOURS avant
// d'ajouter des balises → rendu du dossier sans faille d'injection.
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
function mdToHtml(raw: string): string {
  const inline = (t: string) => t
    .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
    .replace(/__([^_]+)__/g, "<u>$1</u>")
    .replace(/(^|[^*])\*([^*]+)\*/g, "$1<i>$2</i>");
  const lines = esc(raw).split(/\r?\n/);
  let html = "", inUl = false, inOl = false;
  const closeLists = () => { if (inUl) { html += "</ul>"; inUl = false; } if (inOl) { html += "</ol>"; inOl = false; } };
  for (const ln of lines) {
    if (/^•\s+/.test(ln)) { if (inOl) { html += "</ol>"; inOl = false; } if (!inUl) { html += "<ul>"; inUl = true; } html += "<li>" + inline(ln.replace(/^•\s+/, "")) + "</li>"; continue; }
    if (/^\d+\.\s+/.test(ln)) { if (inUl) { html += "</ul>"; inUl = false; } if (!inOl) { html += "<ol>"; inOl = true; } html += "<li>" + inline(ln.replace(/^\d+\.\s+/, "")) + "</li>"; continue; }
    closeLists();
    if (ln.trim() === "") continue;
    html += "<p>" + inline(ln) + "</p>";
  }
  closeLists();
  return html;
}
const plainify = (raw: string) => raw.replace(/\*\*|__|\*/g, "").replace(/^\s*(•\s|\d+\.\s)/gm, "").trim();

// ── UI atoms ────────────────────────────────────────────────────────────────
function Field({ label, req, hint, children }: { label: string; req?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[0.68rem] uppercase tracking-[0.06em] text-faint">{label}{req ? <span style={{ color: "var(--oxblood)" }}> *</span> : null}</span>
      {children}
      {hint ? <span className="text-[0.66rem] text-faint">{hint}</span> : null}
    </label>
  );
}
function CarteForm({ titre, icon: Icon, aside, children }: { titre: string; icon: typeof Shield; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="flex flex-col rounded-[14px] border border-border bg-surface p-4 shadow-card">
      <div className="mb-3 flex items-center gap-2 border-b border-border pb-2.5">
        <Icon className="h-4 w-4" style={{ color: "var(--brass)" }} strokeWidth={1.8} />
        <h3 className="text-[0.74rem] font-semibold uppercase tracking-[0.08em] text-muted">{titre}</h3>
        {aside ? <span className="ml-auto">{aside}</span> : null}
      </div>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}
function Compteur({ v, max }: { v: string; max: number }) {
  return <span className="ml-auto text-[0.62rem] font-num text-faint">{(v || "").length} / {max}</span>;
}

// Petit compteur « + / – » (agents, véhicules…), façon mockup.
function NumStepper({ value, onChange, icon: Icon, placeholder }: { value: string; onChange: (v: string) => void; icon: typeof Shield; placeholder?: string }) {
  const n = Math.max(0, Math.floor(nombre(value)));
  const setN = (x: number) => onChange(String(Math.max(0, x)));
  return (
    <div className="flex items-center gap-1 rounded-[9px] border border-border bg-surface-2 px-1.5 py-1">
      <button type="button" onClick={() => setN(n - 1)} className="grid h-7 w-7 place-items-center rounded-md text-faint transition hover:bg-surface hover:text-ink" aria-label="Diminuer"><Minus className="h-3.5 w-3.5" /></button>
      <input className="w-10 bg-transparent text-center font-num text-[0.95rem] font-bold text-ink outline-none" value={value} onChange={(e) => onChange(e.target.value.replace(/[^0-9]/g, ""))} inputMode="numeric" placeholder={placeholder} aria-label="Quantité" />
      <Icon className="h-4 w-4 shrink-0" style={{ color: "var(--brass)" }} />
      <button type="button" onClick={() => setN(n + 1)} className="grid h-7 w-7 place-items-center rounded-md text-faint transition hover:bg-surface hover:text-ink" aria-label="Augmenter"><Plus className="h-3.5 w-3.5" /></button>
    </div>
  );
}

// Éditeur de texte « à l'ancienne » : barre d'outils robuste (100 % textarea).
function TBtn({ icon: Icon, onClick, title }: { icon: typeof Shield; onClick: () => void; title: string }) {
  return <button type="button" title={title} aria-label={title} onMouseDown={(e) => e.preventDefault()} onClick={onClick} className="grid h-7 w-7 place-items-center rounded-md text-muted transition hover:bg-surface-2 hover:text-ink"><Icon className="h-3.5 w-3.5" /></button>;
}
function RichText({ value, onChange, placeholder, max }: { value: string; onChange: (v: string) => void; placeholder?: string; max: number }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  function surround(mark: string) {
    const el = ref.current; if (!el) return;
    const s = el.selectionStart ?? value.length, e = el.selectionEnd ?? value.length;
    const inner = value.slice(s, e) || "texte";
    const next = (value.slice(0, s) + mark + inner + mark + value.slice(e)).slice(0, max);
    onChange(next);
    requestAnimationFrame(() => { const t = ref.current; if (!t) return; t.focus(); const p = s + mark.length; t.setSelectionRange(p, p + inner.length); });
  }
  function lignes(prefixer: (i: number) => string) {
    const el = ref.current; if (!el) return;
    const s = el.selectionStart ?? 0, e = el.selectionEnd ?? 0;
    const start = value.lastIndexOf("\n", s - 1) + 1;
    let end = value.indexOf("\n", e); if (end === -1) end = value.length;
    const bloc = value.slice(start, end) || "";
    const out = bloc.split("\n").map((ln, i) => prefixer(i) + ln.replace(/^(\s*)(•\s|\d+\.\s)/, "$1")).join("\n");
    const next = (value.slice(0, start) + out + value.slice(end)).slice(0, max);
    onChange(next);
    requestAnimationFrame(() => { const t = ref.current; if (!t) return; t.focus(); t.setSelectionRange(start, start + out.length); });
  }
  return (
    <div className="overflow-hidden rounded-[9px] border border-border bg-surface-2 focus-within:border-[color-mix(in_srgb,var(--accent)_55%,var(--border))]">
      <div className="flex items-center gap-0.5 border-b border-border bg-surface px-1.5 py-1">
        <TBtn icon={Bold} onClick={() => surround("**")} title="Gras" />
        <TBtn icon={Italic} onClick={() => surround("*")} title="Italique" />
        <TBtn icon={Underline} onClick={() => surround("__")} title="Souligné" />
        <span className="mx-1 h-4 w-px bg-border" />
        <TBtn icon={List} onClick={() => lignes(() => "• ")} title="Liste à puces" />
        <TBtn icon={ListOrdered} onClick={() => lignes((i) => `${i + 1}. `)} title="Liste numérotée" />
        <span className="mx-1 h-4 w-px bg-border" />
        <TBtn icon={Minus} onClick={() => lignes(() => "— ")} title="Tiret / séparation" />
      </div>
      <textarea ref={ref} className="min-h-[112px] w-full resize-y bg-transparent px-3 py-2 text-[0.86rem] text-ink outline-none placeholder:text-faint" value={value} onChange={(e) => onChange(e.target.value.slice(0, max))} placeholder={placeholder} />
      <div className="flex px-2 pb-1"><Compteur v={value} max={max} /></div>
    </div>
  );
}

// ── Ornements du dossier (1904) ─────────────────────────────────────────────
function SceauLoup({ size = 60 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true" style={{ transform: "rotate(-9deg)", filter: "drop-shadow(0 3px 4px rgba(60,20,12,.4))" }}>
      <defs>
        <radialGradient id="wax" cx="38%" cy="34%" r="72%">
          <stop offset="0%" stopColor="#c15a48" /><stop offset="55%" stopColor="#9c3527" /><stop offset="100%" stopColor="#6d2018" />
        </radialGradient>
      </defs>
      <circle cx="50" cy="50" r="44" fill="url(#wax)" />
      <circle cx="50" cy="50" r="44" fill="none" stroke="#4d160f" strokeWidth="1.4" opacity="0.5" />
      <circle cx="50" cy="50" r="35" fill="none" stroke="#f4d9cf" strokeWidth="1.1" strokeDasharray="2 3" opacity="0.55" />
      <path d="M50 30 L60 40 L58 52 L64 66 L50 60 L36 66 L42 52 L40 40 Z" fill="none" stroke="#f4d9cf" strokeWidth="2" strokeLinejoin="round" opacity="0.85" />
      <circle cx="45" cy="46" r="1.7" fill="#f4d9cf" opacity="0.85" /><circle cx="55" cy="46" r="1.7" fill="#f4d9cf" opacity="0.85" />
    </svg>
  );
}
function BlasonLoup({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      <path d="M50 26 L64 40 L61 56 L68 74 L50 66 L32 74 L39 56 L36 40 Z" fill="none" stroke="#5c4a2f" strokeWidth="3" strokeLinejoin="round" />
      <circle cx="44" cy="47" r="2.2" fill="#5c4a2f" /><circle cx="56" cy="47" r="2.2" fill="#5c4a2f" />
    </svg>
  );
}
function Tampon({ texte, tone = "#8f2f28" }: { texte: string; tone?: string }) {
  return (
    <span style={{ display: "inline-block", transform: "rotate(-8deg)", border: `2px solid ${tone}`, color: tone, padding: "3px 9px", borderRadius: 4, fontFamily: "'Courier New',monospace", fontWeight: 700, fontSize: 11, letterSpacing: "0.14em", boxShadow: `inset 0 0 0 2px ${tone}22`, opacity: 0.9 }}>{texte}</span>
  );
}
function Pips({ n, total = 6, tone }: { n: number; total?: number; tone: string }) {
  return (
    <span style={{ display: "inline-flex", gap: 3, verticalAlign: "middle" }} aria-hidden="true">
      {Array.from({ length: total }).map((_, i) => (
        <svg key={i} width="12" height="12" viewBox="0 0 24 24" style={{ opacity: i < n ? 1 : 0.22 }}>
          <path d="M12 2 L20 6 V12 C20 17 16 21 12 22 C8 21 4 17 4 12 V6 Z" fill={i < n ? tone : "#9a8763"} />
        </svg>
      ))}
    </span>
  );
}
// Carte parchemin (dossier) — tracé à l'encre, pur décor 1904.
function CarteAncienne({ depart, arrivee, compact = false }: { depart: string; arrivee: string; compact?: boolean }) {
  return (
    <div style={{ position: "relative", borderRadius: 8, overflow: "hidden", border: "1px solid #b39c6e", background: "linear-gradient(135deg,#e9dcbe,#dcc9a0)", height: compact ? 92 : 150 }}>
      <svg viewBox="0 0 300 150" preserveAspectRatio="none" width="100%" height="100%">
        {Array.from({ length: 8 }).map((_, i) => <path key={`h${i}`} d={`M0 ${18 + i * 17} Q 75 ${10 + i * 17} 150 ${18 + i * 17} T 300 ${18 + i * 17}`} fill="none" stroke="#b7a074" strokeWidth="0.6" opacity="0.5" />)}
        <path d="M20 130 Q 90 90 140 100 T 280 40" fill="none" stroke="#8aa0a8" strokeWidth="2.4" opacity="0.5" />
        <path d="M40 120 Q 120 40 165 78 T 262 34" fill="none" stroke="#5c3d1c" strokeWidth="2" strokeDasharray="2 5" strokeLinecap="round" />
        <circle cx="40" cy="120" r="5" fill="#8f2f28" stroke="#f5ead0" strokeWidth="1.5" />
        <circle cx="262" cy="34" r="5" fill="#9a761c" stroke="#f5ead0" strokeWidth="1.5" />
      </svg>
      <span style={{ position: "absolute", left: 8, bottom: 6, fontFamily: "'Courier New',monospace", fontSize: 9, color: "#5c4a2f", background: "#f5ead0cc", padding: "1px 5px", borderRadius: 3 }}>{depart || "Départ"}</span>
      <span style={{ position: "absolute", right: 8, top: 6, fontFamily: "'Courier New',monospace", fontSize: 9, color: "#5c4a2f", background: "#f5ead0cc", padding: "1px 5px", borderRadius: 3 }}>{arrivee || "Destination"}</span>
    </div>
  );
}
// Carte SOMBRE (formulaire) — vieille carte sur fond charbon, tracé laiton lumineux.
function CarteSombre({ depart, arrivee, distance, duree }: { depart: string; arrivee: string; distance: string; duree: string }) {
  return (
    <div style={{ position: "relative", borderRadius: 10, overflow: "hidden", border: "1px solid var(--border)", background: "radial-gradient(120% 120% at 20% 10%, #23201a, #14120e 70%)" }}>
      <svg viewBox="0 0 400 180" preserveAspectRatio="none" width="100%" height="170">
        {Array.from({ length: 9 }).map((_, i) => <path key={`c${i}`} d={`M0 ${16 + i * 18} Q 100 ${8 + i * 18} 200 ${16 + i * 18} T 400 ${16 + i * 18}`} fill="none" stroke="#c8a45c" strokeWidth="0.5" opacity="0.12" />)}
        <path d="M20 150 Q 120 110 180 122 T 380 60" fill="none" stroke="#6f9fc4" strokeWidth="2" opacity="0.18" />
        <path d="M46 140 Q 150 54 220 96 T 356 44" fill="none" stroke="var(--brass)" strokeWidth="2.4" strokeDasharray="2 6" strokeLinecap="round" style={{ filter: "drop-shadow(0 0 4px color-mix(in srgb,var(--brass) 60%,transparent))" }} />
        <circle cx="46" cy="140" r="6" fill="var(--good)" stroke="#0d0c0a" strokeWidth="2" />
        <circle cx="356" cy="44" r="6" fill="var(--brass)" stroke="#0d0c0a" strokeWidth="2" />
      </svg>
      <span style={{ position: "absolute", left: 10, bottom: 8, fontSize: 10, color: "var(--muted)", background: "#0d0c0acc", padding: "2px 7px", borderRadius: 4, border: "1px solid var(--border)" }}>◉ {depart || "Départ"}</span>
      <span style={{ position: "absolute", right: 10, top: 8, fontSize: 10, color: "var(--brass)", background: "#0d0c0acc", padding: "2px 7px", borderRadius: 4, border: "1px solid var(--border)" }}>{arrivee || "Destination"} ◈</span>
      <div className="flex items-center justify-between gap-3 border-t border-border px-3 py-1.5 text-[0.68rem] text-faint" style={{ background: "#0d0c0a99" }}>
        <span className="inline-flex items-center gap-1"><Route className="h-3 w-3" style={{ color: "var(--brass)" }} /> DISTANCE&nbsp;: <b className="text-muted">{distance || "—"}</b></span>
        <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" style={{ color: "var(--brass)" }} /> DURÉE&nbsp;: <b className="text-muted">{duree || "—"}</b></span>
      </div>
    </div>
  );
}

// ── Dossier vivant (parchemin) ──────────────────────────────────────────────
const DL = ({ k, v }: { k: string; v: React.ReactNode }) => (
  <div style={{ display: "grid", gridTemplateColumns: "42% 58%", gap: 8, padding: "3px 0", borderBottom: "1px dotted #cbb488" }}>
    <span style={{ fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", color: "#8a6f43" }}>{k}</span>
    <span style={{ fontSize: 12.5, color: "#2c2013", fontWeight: 600 }}>{v}</span>
  </div>
);
function SectionDoc({ titre }: { titre: string }) {
  return <div style={{ margin: "13px 0 5px", fontFamily: "'Courier New',monospace", fontSize: 10, fontWeight: 700, letterSpacing: "0.16em", color: "#7a5a2a", borderBottom: "1.5px solid #7a5a2a", paddingBottom: 2 }}>{titre}</div>;
}

function DossierVivant({ d, dateStr, auteur }: { d: Dossier; dateStr: string; auteur: string }) {
  const t = typeInfo(d.type); const m = menaceInfo(d.menace); const c = confidInfo(d.confidentialite);
  const equip = d.equipement.length ? d.equipement.join(", ") : "—";
  const trajet = [d.lieuDepart, d.destination].filter(Boolean).join(" → ") || "—";
  return (
    <div id="op-dossier-doc" style={{ position: "relative", fontFamily: "Georgia,'Times New Roman',serif", color: "#2c2013", background: "linear-gradient(#f6ecd3,#efe3c6)", border: "1px solid #b39c6e", borderRadius: 10, padding: "26px 26px 30px", boxShadow: "inset 0 0 0 4px #f8f2e2, inset 0 0 0 5px #c2a86f, 0 10px 30px rgba(40,26,10,.28)" }}>
      {c.tampon ? <div style={{ position: "absolute", top: 20, right: 18 }}><Tampon texte={c.tampon} /></div> : null}
      <div style={{ display: "flex", alignItems: "center", gap: 11, borderBottom: "2px solid #2c2013", paddingBottom: 12 }}>
        <BlasonLoup />
        <div>
          <div style={{ fontWeight: 700, fontSize: 17, letterSpacing: "0.04em" }}>IRON WOLF COMPANY</div>
          <div style={{ fontFamily: "'Courier New',monospace", fontSize: 10, letterSpacing: "0.22em", color: "#7a5a2a" }}>DOSSIER OPÉRATIONNEL</div>
        </div>
        <div style={{ marginLeft: "auto", textAlign: "right", fontFamily: "'Courier New',monospace", fontSize: 10, color: "#7a5a2a" }}>
          <div>N° {d.codeOp || "OP-—"}</div>
          <div>{dateStr}</div>
        </div>
      </div>

      <SectionDoc titre="TITRE DE LA MISSION" />
      <div style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.25 }}>{d.titre || <span style={{ color: "#a08a5e", fontWeight: 400, fontStyle: "italic" }}>Sans titre…</span>}</div>
      {d.nomRadio ? <div style={{ fontFamily: "'Courier New',monospace", fontSize: 10, color: "#7a5a2a", marginTop: 2 }}>NOM RADIO : « {d.nomRadio} »</div> : null}

      <DL k="Type" v={t.label} />
      <DL k="Prime / Butin" v={money(d.primeGlobale)} />
      <div style={{ display: "grid", gridTemplateColumns: "42% 58%", gap: 8, padding: "5px 0", borderBottom: "1px dotted #cbb488", alignItems: "center" }}>
        <span style={{ fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", color: "#8a6f43" }}>Niveau de risque</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}><b style={{ fontFamily: "'Courier New',monospace", fontSize: 11, color: m.tone }}>{m.label.toUpperCase()}</b> <Pips n={m.pips} tone={m.tone} /></span>
      </div>

      {(d.objectif || d.description.trim()) ? (<><SectionDoc titre="OBJECTIF" />
        {d.objectif ? <div style={{ fontSize: 12.5, fontWeight: 600 }}>{d.objectif}</div> : null}
        {d.description.trim() ? <div className="op-doc-rt" style={{ fontSize: 11.5, lineHeight: 1.5, marginTop: 4, textAlign: "justify", color: "#3a2c17" }} dangerouslySetInnerHTML={{ __html: mdToHtml(d.description) }} /> : null}</>) : null}

      <SectionDoc titre="ITINÉRAIRE" />
      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>{trajet}</div>
      <CarteAncienne depart={d.lieuDepart} arrivee={d.destination} compact />
      <div style={{ display: "flex", gap: 10, marginTop: 6, fontFamily: "'Courier New',monospace", fontSize: 10, color: "#5c4a2f" }}>
        <span>DISTANCE : {d.distance || "—"}</span><span>·</span><span>DURÉE : {d.duree || "—"}</span>{d.terrain ? <><span>·</span><span>{d.terrain.toUpperCase()}</span></> : null}
      </div>

      <SectionDoc titre="RESSOURCES" />
      <DL k="Pôle responsable" v={d.pole === "illegal" ? "La Confrérie" : "Iron Wolf"} />
      {d.responsable ? <DL k="Responsable" v={d.responsable} /> : null}
      <DL k="Équipe" v={`${d.agents || "0"} agent(s)`} />
      <DL k="Véhicules" v={d.vehicules || "0"} />
      <DL k="Équipement" v={equip} />

      <SectionDoc titre="PLANIFICATION" />
      <DL k="Départ" v={[d.dateDebut, d.heureDebut].filter(Boolean).join(" · ") || "—"} />
      <DL k="Fin estimée" v={[d.dateFin, d.heureFin].filter(Boolean).join(" · ") || "—"} />
      <DL k="Conditions" v={d.meteo || "—"} />
      {d.notesLogistiques ? <div style={{ fontSize: 11, lineHeight: 1.45, marginTop: 5, color: "#3a2c17" }}><b style={{ fontSize: 10, color: "#8a6f43" }}>NOTES : </b>{d.notesLogistiques}</div> : null}

      {(d.consignes || d.ordreFeu || d.extraction) ? (<><SectionDoc titre="CONSIGNES" />
        <div style={{ fontSize: 11, lineHeight: 1.5, color: "#3a2c17", whiteSpace: "pre-wrap" }}>{[d.consignes, d.ordreFeu && `Ouverture du feu : ${d.ordreFeu}`, d.extraction && `Extraction : ${d.extraction}`].filter(Boolean).join("\n")}</div></>) : null}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginTop: 20, paddingTop: 12, borderTop: "1px solid #cbb488" }}>
        <div style={{ fontFamily: "'Courier New',monospace", fontSize: 10, color: "#5c4a2f", lineHeight: 1.7 }}>
          <div>CRÉÉ LE&nbsp;&nbsp; {dateStr}</div>
          <div>CRÉÉ PAR&nbsp; {auteur}</div>
          <div style={{ fontFamily: "'Segoe Script','Brush Script MT',cursive", fontSize: 20, color: "#3a2c17", marginTop: 3 }}>{d.responsable || auteur}</div>
        </div>
        <SceauLoup />
      </div>
    </div>
  );
}

// ── Assistant ───────────────────────────────────────────────────────────────
export function OperationWizard({ membres, pole, auteur }: { membres: MembreLite[]; pole: string; auteur: string }) {
  const router = useRouter();
  const [d, setD] = useState<Dossier>(() => ({ ...VIDE, pole: pole === "illegal" ? "illegal" : "legal" }));
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [now, setNow] = useState<Date | null>(null);
  const [equipCustom, setEquipCustom] = useState("");
  const [apercu, setApercu] = useState<"contrat" | "imprimable">("contrat");
  const chargé = useRef(false);

  const set = <K extends keyof Dossier,>(k: K, v: Dossier[K]) => setD((p) => ({ ...p, [k]: v }));

  // Horloge RP (client, évite tout décalage d'hydratation).
  useEffect(() => { setNow(new Date()); const t = setInterval(() => setNow(new Date()), 30000); return () => clearInterval(t); }, []);
  // Restaure le brouillon + génère le code d'opération côté client (pas de mismatch SSR).
  useEffect(() => {
    let restore: Partial<Dossier> | null = null;
    try { const raw = localStorage.getItem(DRAFT_KEY); if (raw) { const j = JSON.parse(raw); if (j && typeof j === "object") restore = j as Partial<Dossier>; } } catch { /* ignore */ }
    setD((p) => { const base = restore ? { ...p, ...restore } : p; return { ...base, codeOp: base.codeOp || genCode() }; });
    chargé.current = true;
  }, []);
  // Sauvegarde auto (débouncée) une fois le brouillon chargé.
  useEffect(() => {
    if (!chargé.current) return;
    const t = setTimeout(() => { try { localStorage.setItem(DRAFT_KEY, JSON.stringify(d)); } catch { /* quota */ } }, 700);
    return () => clearTimeout(t);
  }, [d]);

  const dateStr = now ? now.toLocaleDateString("fr-FR", { weekday: "long", day: "2-digit", month: "long" }).replace(/^\w/, (c) => c.toUpperCase()) + ", " + now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : "—";

  const toggleEquip = (e: string) => setD((p) => ({ ...p, equipement: p.equipement.includes(e) ? p.equipement.filter((x) => x !== e) : [...p.equipement, e] }));
  const addEquipCustom = () => { const v = equipCustom.trim(); if (v && !d.equipement.includes(v)) setD((p) => ({ ...p, equipement: [...p.equipement, v] })); setEquipCustom(""); };

  // ── Analyse & alertes ──
  const alertes = useMemo(() => {
    const a: { t: string; tone: string }[] = [];
    const m = menaceInfo(d.menace); const nbAgents = nombre(d.agents); const nbVeh = nombre(d.vehicules);
    const prime = nombre(d.primeGlobale);
    if (!d.titre.trim()) a.push({ t: "Le dossier n'a pas encore de titre.", tone: "var(--warn)" });
    if (nbAgents > 0 && nbAgents < m.agents) a.push({ t: `Mission « ${m.label} » avec seulement ${nbAgents} agent(s) — ${m.agents} recommandé(s).`, tone: "var(--oxblood)" });
    if (nbAgents === 0) a.push({ t: "Aucun agent assigné.", tone: "var(--warn)" });
    if (!d.chefMedical && !d.equipement.includes("Trousse médicale")) a.push({ t: "Aucun soin médical prévu (ni chef médical, ni trousse).", tone: "var(--warn)" });
    if (["escorte", "transport", "extraction"].includes(d.type) && nbVeh === 0) a.push({ t: "Aucun véhicule sélectionné pour une mission de mobilité.", tone: "var(--warn)" });
    if ((d.lieuDepart || d.destination) && !d.itineraire.trim() && !d.distance.trim()) a.push({ t: "Itinéraire incomplet (ni tracé, ni distance).", tone: "var(--warn)" });
    if (["eleve", "critique", "extreme"].includes(d.menace) && prime > 0 && prime < 300) a.push({ t: "Prime faible au regard d'un risque élevé.", tone: "var(--oxblood)" });
    if (["eleve", "critique", "extreme"].includes(d.menace) && !d.equipement.length) a.push({ t: "Aucun matériel prévu pour un risque élevé.", tone: "var(--warn)" });
    return a;
  }, [d]);

  const rempli = Object.entries(d).filter(([k, v]) => k !== "codeOp" && k !== "pole" && k !== "phase" && k !== "type" && k !== "confidentialite" && k !== "menace" && (Array.isArray(v) ? v.length : String(v).trim())).length;
  const totalChamps = 30;
  const progression = Math.min(100, Math.round((rempli / totalChamps) * 100));

  async function sauverBrouillon() {
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(d)); setFlash("Brouillon enregistré sur cet appareil."); setTimeout(() => setFlash(null), 2500); } catch { toastErreur("Sauvegarde impossible (stockage plein ?)."); }
  }
  function reinitialiser() {
    if (typeof window !== "undefined" && !window.confirm("Effacer le brouillon en cours et repartir d'un dossier vierge ?")) return;
    try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
    setD({ ...VIDE, pole: pole === "illegal" ? "illegal" : "legal", codeOp: genCode() });
    setStep(1);
  }
  function imprimer() { window.print(); }

  async function creer() {
    if (d.titre.trim().length < 2) { setStep(1); setFlash("Donne un titre à la mission."); return; }
    setBusy(true);
    const lieu = [d.lieuDepart, d.destination].filter(Boolean).join(" → ");
    const r = await creerOperation({
      cible: d.titre.trim(), categorie: typeInfo(d.type).label, pole: d.pole,
      prime: d.primeGlobale || undefined, lieu: lieu || undefined, objectif: d.objectif || plainify(d.description) || undefined,
      phase: d.phase, dossier: { ...d } as unknown as Record<string, unknown>,
    });
    setBusy(false);
    if (!r.ok) { toastErreur(r.error || "Création impossible — réessaie."); return; }
    try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
    router.push("/operations");
    router.refresh();
  }

  const primePerAgent = (() => { const p = nombre(d.primeGlobale); const n = nombre(d.agents); return p > 0 && n > 0 ? Math.round(p / n) : 0; })();

  return (
    <>
      <style>{`
        @media print{body *{visibility:hidden!important}#op-dossier-doc,#op-dossier-doc *{visibility:visible!important}#op-dossier-doc{position:fixed!important;inset:0!important;margin:0!important;border-radius:0!important;box-shadow:none!important;max-width:none!important}}
        .op-doc-rt p{margin:3px 0}.op-doc-rt ul{margin:4px 0 4px 18px;list-style:disc}.op-doc-rt ol{margin:4px 0 4px 20px;list-style:decimal}.op-doc-rt li{margin:1px 0}
      `}</style>

      {/* En-tête */}
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[1.7rem] leading-tight">Opérations &amp; Contrats</h1>
          <p className="text-[0.82rem] italic text-muted">Planifiez. Exécutez. Dominez.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[0.72rem]">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-2 px-2.5 py-1 text-muted"><CalendarClock className="h-3.5 w-3.5" style={{ color: "var(--brass)" }} /> {dateStr}</span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-2 px-2.5 py-1 font-semibold" style={{ color: "var(--brass)" }}><Landmark className="h-3.5 w-3.5" /> {d.pole === "illegal" ? "La Confrérie" : "Iron Wolf"}</span>
          <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-semibold" style={{ borderColor: "color-mix(in srgb,var(--good) 40%,var(--border))", color: "var(--good)" }}><span className="disp-live-dot h-1.5 w-1.5 rounded-full" style={{ background: "var(--good)" }} /> Données en direct</span>
          <button onClick={reinitialiser} title="Réinitialiser le brouillon" aria-label="Réinitialiser le brouillon" className="grid h-7 w-7 place-items-center rounded-full border border-border bg-surface-2 text-faint transition hover:border-border-2 hover:text-ink"><RotateCcw className="h-3.5 w-3.5" /></button>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(360px,440px)]">
        {/* Colonne assistant */}
        <div className="min-w-0">
          {/* Stepper */}
          <div className="mb-4 rounded-[14px] border border-border bg-surface p-3 shadow-card">
            <div className="flex items-stretch gap-1 overflow-x-auto pb-1">
              {ETAPES.map((e, i) => {
                const on = step === e.n; const done = step > e.n;
                return (
                  <div key={e.n} className="flex flex-1 items-center gap-1">
                    <button onClick={() => setStep(e.n)} className="flex min-w-max flex-1 items-center gap-2 rounded-lg px-2.5 py-1.5 text-left transition" style={{ background: on ? "color-mix(in srgb,var(--accent) 12%,transparent)" : "transparent" }}>
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[0.76rem] font-bold" style={{ background: on ? "var(--accent)" : done ? "color-mix(in srgb,var(--good) 25%,transparent)" : "var(--surface-2)", color: on ? "#1a1206" : done ? "var(--good)" : "var(--faint)", border: `1px solid ${on ? "var(--accent)" : done ? "color-mix(in srgb,var(--good) 45%,var(--border))" : "var(--border)"}`, boxShadow: on ? "0 0 0 3px color-mix(in srgb,var(--accent) 22%,transparent)" : "none" }}>{done ? <Check className="h-4 w-4" /> : e.n}</span>
                      <span className="hidden md:block">
                        <span className="block text-[0.78rem] font-semibold leading-tight" style={{ color: on ? "var(--ink)" : "var(--muted)" }}>{e.label}</span>
                        <span className="block text-[0.62rem] leading-tight text-faint">{e.sous}</span>
                      </span>
                    </button>
                    {i < ETAPES.length - 1 ? <span className="hidden h-px min-w-[10px] flex-1 md:block" style={{ background: step > e.n ? "color-mix(in srgb,var(--good) 45%,var(--border))" : "var(--border)" }} /> : null}
                  </div>
                );
              })}
            </div>
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full transition-all" style={{ width: `${progression}%`, background: "linear-gradient(90deg,var(--brass),var(--accent-hi))" }} /></div>
          </div>

          {flash ? <div className="mb-3 rounded-lg border px-3 py-2 text-[0.8rem]" style={{ borderColor: "color-mix(in srgb,var(--good) 40%,var(--border))", background: "color-mix(in srgb,var(--good) 8%,transparent)", color: "var(--good)" }}>{flash}</div> : null}

          {/* Alertes d'analyse */}
          {alertes.length ? (
            <div className="mb-4 rounded-[14px] border p-3" style={{ borderColor: "color-mix(in srgb,var(--warn) 40%,var(--border))", background: "color-mix(in srgb,var(--warn) 6%,transparent)" }}>
              <div className="mb-1.5 flex items-center gap-1.5 text-[0.72rem] font-semibold uppercase tracking-[0.06em]" style={{ color: "var(--warn)" }}><AlertTriangle className="h-3.5 w-3.5" /> Analyse de la mission</div>
              <ul className="flex flex-col gap-1">
                {alertes.map((al, i) => <li key={i} className="flex items-start gap-1.5 text-[0.78rem]" style={{ color: al.tone }}><span aria-hidden>⚠</span><span className="text-muted">{al.t}</span></li>)}
              </ul>
            </div>
          ) : (
            <div className="mb-4 rounded-[14px] border border-border px-3 py-2 text-[0.78rem] text-faint" style={{ background: "color-mix(in srgb,var(--good) 5%,transparent)" }}>✓ Aucune alerte — le dossier est cohérent.</div>
          )}

          {/* ── Étapes ── */}
          <div className="flex flex-col gap-4">{renderStep()}</div>

          {/* Barre d'actions */}
          <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
            <span className="text-[0.72rem] text-faint">* Champs obligatoires</span>
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={sauverBrouillon} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-3 py-2 text-[0.8rem] font-semibold hover:border-border-2"><Save className="h-3.5 w-3.5" /> Enregistrer comme brouillon</button>
              {step > 1 ? <button onClick={() => setStep((s) => s - 1)} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-3 py-2 text-[0.8rem] font-semibold hover:border-border-2"><ChevronLeft className="h-3.5 w-3.5" /> Précédent</button> : null}
              {step < 5 ? (
                <button onClick={() => setStep((s) => s + 1)} className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[0.82rem] font-semibold text-black/85" style={{ background: "var(--accent)" }}>Continuer <ChevronRight className="h-3.5 w-3.5" /> <span className="hidden sm:inline font-normal opacity-80">Étape suivante : {ETAPES[step].label}</span></button>
              ) : (
                <button onClick={creer} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[0.82rem] font-semibold text-black/85 disabled:opacity-60" style={{ background: "var(--good)" }}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardCheck className="h-4 w-4" />} Valider &amp; ouvrir le dossier</button>
              )}
            </div>
          </div>
        </div>

        {/* Colonne dossier vivant */}
        <div className="min-w-0">
          <div className="sticky top-4">
            <div className="mb-2 inline-flex w-full rounded-lg border border-border bg-surface p-0.5">
              <button onClick={() => setApercu("contrat")} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md px-2.5 py-1.5 text-[0.72rem] font-semibold transition" style={apercu === "contrat" ? { background: "var(--accent)", color: "#1a1206" } : { color: "var(--muted)" }}><FileSignature className="h-3.5 w-3.5" /> Aperçu du contrat</button>
              <button onClick={() => { setApercu("imprimable"); imprimer(); }} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md px-2.5 py-1.5 text-[0.72rem] font-semibold transition" style={apercu === "imprimable" ? { background: "var(--accent)", color: "#1a1206" } : { color: "var(--muted)" }}><Printer className="h-3.5 w-3.5" /> Vue imprimable</button>
            </div>
            <div className="max-h-[calc(100vh-8rem)] overflow-y-auto pr-1">
              <DossierVivant d={d} dateStr={dateStr} auteur={auteur} />
            </div>
          </div>
        </div>
      </div>
    </>
  );

  // ── Rendu des étapes (2 colonnes premium, façon mockup) ──
  function renderStep() {
    if (step === 1) return (
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <CarteForm titre="Informations générales" icon={FileText}>
          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <Field label="Titre / Objectif" req><input className={inputCls} value={d.titre} onChange={(e) => set("titre", e.target.value.slice(0, 120))} placeholder="Escorte d'un convoi vers Saint-Denis" /></Field>
            <Field label="Code opération"><input className={inputCls + " w-full sm:w-28 font-num"} value={d.codeOp} onChange={(e) => set("codeOp", e.target.value.slice(0, 20))} /></Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nom radio" hint="Nom de code (télégraphe)"><div className="flex items-center gap-1.5"><Radio className="h-4 w-4 text-faint" /><input className={inputCls} value={d.nomRadio} onChange={(e) => set("nomRadio", e.target.value.slice(0, 40))} placeholder="BLACK WOLF" /></div></Field>
            <Field label="Confidentialité"><Puces options={CONFIDS.map((c) => ({ key: c.key, label: c.label }))} value={d.confidentialite} onChange={(v) => set("confidentialite", v)} /></Field>
          </div>
          <Field label="Objectif principal"><input className={inputCls} value={d.objectif} onChange={(e) => set("objectif", e.target.value.slice(0, 200))} placeholder="Livraison sécurisée, aucune perte" /></Field>
          <Field label="Objectifs secondaires"><input className={inputCls} value={d.objectifsSecondaires} onChange={(e) => set("objectifsSecondaires", e.target.value.slice(0, 300))} placeholder="Repérer les bandes hostiles en chemin…" /></Field>
          <Field label="Description détaillée" req><RichText value={d.description} onChange={(v) => set("description", v)} max={1000} placeholder="Assurer la protection rapprochée d'un convoi… Menaces possibles… Objectif : livraison sécurisée." /></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Commanditaire" hint="Qui a demandé la mission"><input className={inputCls} value={d.commanditaire} onChange={(e) => set("commanditaire", e.target.value.slice(0, 120))} placeholder="M. Cornwall" /></Field>
            <Field label="Financeur" hint="Qui finance"><input className={inputCls} value={d.financeur} onChange={(e) => set("financeur", e.target.value.slice(0, 120))} placeholder="Compagnie ferroviaire" /></Field>
          </div>
        </CarteForm>

        <CarteForm titre="Classification & niveau de menace" icon={Crosshair}>
          <Field label="Type d'opération" req>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-2">
              {TYPES.map((t) => { const on = d.type === t.key; return (
                <button key={t.key} onClick={() => set("type", t.key)} className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[0.76rem] font-semibold transition" style={{ borderColor: on ? "var(--accent)" : "var(--border)", background: on ? "color-mix(in srgb,var(--accent) 12%,transparent)" : "var(--surface-2)", color: on ? "var(--accent)" : "var(--muted)" }}><t.icon className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">{t.label}</span></button>
              ); })}
            </div>
          </Field>
          <Field label="Prime / Butin visé"><input className={inputCls} value={d.primeGlobale} onChange={(e) => set("primeGlobale", e.target.value.slice(0, 40))} placeholder="$800" /></Field>
          <Field label="Niveau de menace">
            <div className="flex flex-wrap gap-1.5">
              {MENACES.map((m) => { const on = d.menace === m.key; return (
                <button key={m.key} onClick={() => set("menace", m.key)} className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[0.76rem] font-semibold transition" style={{ borderColor: on ? m.tone : "var(--border)", background: on ? `color-mix(in srgb,${m.tone} 16%,transparent)` : "var(--surface-2)", color: on ? m.tone : "var(--muted)" }}>{m.label}</button>
              ); })}
            </div>
            <div className="mt-2 flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2 text-[0.72rem] text-faint"><AlertTriangle className="h-3.5 w-3.5" style={{ color: menaceInfo(d.menace).tone }} /> Préparation conseillée : <b style={{ color: menaceInfo(d.menace).tone }}>{menaceInfo(d.menace).agents} agent(s) minimum</b> <Pips n={menaceInfo(d.menace).pips} tone={menaceInfo(d.menace).tone} /></div>
          </Field>
        </CarteForm>
      </div>
    );

    if (step === 2) return (
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <CarteForm titre="Ressources & équipe" icon={Users}>
          <Field label="Pôle responsable" req><Puces options={[{ key: "legal", label: "Iron Wolf" }, { key: "illegal", label: "La Confrérie" }]} value={d.pole} onChange={(v) => set("pole", v)} /></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Responsable de mission"><SelMembre membres={membres} value={d.responsable} onChange={(v) => set("responsable", v)} /></Field>
            <Field label="Second"><SelMembre membres={membres} value={d.second} onChange={(v) => set("second", v)} /></Field>
            <Field label="Chef médical"><SelMembre membres={membres} value={d.chefMedical} onChange={(v) => set("chefMedical", v)} /></Field>
            <Field label="Chef sécurité"><SelMembre membres={membres} value={d.chefSecurite} onChange={(v) => set("chefSecurite", v)} /></Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Agents"><NumStepper value={d.agents} onChange={(v) => set("agents", v)} icon={Users} placeholder="5" /></Field>
            <Field label="Invités / mercenaires"><NumStepper value={d.invites} onChange={(v) => set("invites", v)} icon={Ghost} placeholder="0" /></Field>
            <Field label="Véhicules"><NumStepper value={d.vehicules} onChange={(v) => set("vehicules", v)} icon={Car} placeholder="2" /></Field>
          </div>
          <Field label="État des véhicules / attelage"><input className={inputCls} value={d.vehiculeEtat} onChange={(e) => set("vehiculeEtat", e.target.value.slice(0, 200))} placeholder="Diligence en bon état, 2 chevaux de rechange…" /></Field>
        </CarteForm>

        <CarteForm titre="Équipement spécial" icon={Wrench}>
          <div className="flex flex-wrap gap-1.5">
            {d.equipement.length ? d.equipement.map((e) => (
              <span key={e} className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[0.76rem] font-semibold" style={{ borderColor: "color-mix(in srgb,var(--brass) 55%,var(--border))", background: "color-mix(in srgb,var(--brass) 14%,transparent)", color: "var(--brass)" }}>{e}<button onClick={() => toggleEquip(e)} className="grid h-4 w-4 place-items-center rounded-full hover:bg-black/20" aria-label={`Retirer ${e}`}><X className="h-3 w-3" /></button></span>
            )) : <span className="text-[0.76rem] italic text-faint">Aucun équipement sélectionné pour l&apos;instant.</span>}
          </div>
          <div className="flex items-center gap-1.5">
            <input className={inputCls} value={equipCustom} onChange={(e) => setEquipCustom(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addEquipCustom(); } }} placeholder="Ajouter un équipement…" maxLength={40} list="op-equip-sugg" />
            <datalist id="op-equip-sugg">{EQUIPEMENTS.map((e) => <option key={e} value={e} />)}</datalist>
            <button onClick={addEquipCustom} className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-border bg-surface-2 px-3 py-2 text-[0.8rem] font-semibold hover:border-border-2"><Plus className="h-3.5 w-3.5" /> Ajouter</button>
          </div>
          <div>
            <div className="mb-1.5 text-[0.66rem] uppercase tracking-[0.06em] text-faint">Suggestions</div>
            <div className="flex flex-wrap gap-1.5">
              {EQUIPEMENTS.filter((e) => !d.equipement.includes(e)).map((e) => (
                <button key={e} onClick={() => toggleEquip(e)} className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-2 px-2.5 py-1 text-[0.74rem] font-semibold text-muted transition hover:border-border-2 hover:text-ink"><Plus className="h-3 w-3" /> {e}</button>
              ))}
            </div>
          </div>
        </CarteForm>
      </div>
    );

    if (step === 3) return (
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <CarteForm titre="Lieu & itinéraire" icon={MapPin}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Lieu de départ" req><input className={inputCls} value={d.lieuDepart} onChange={(e) => set("lieuDepart", e.target.value.slice(0, 120))} placeholder="Valentine, Rhodes" /></Field>
            <Field label="Destination" req><input className={inputCls} value={d.destination} onChange={(e) => set("destination", e.target.value.slice(0, 120))} placeholder="Saint-Denis" /></Field>
          </div>
          <Field label="Itinéraire"><CarteSombre depart={d.lieuDepart} arrivee={d.destination} distance={d.distance} duree={d.duree} /></Field>
          <Field label="Description de l'itinéraire" hint="Points de passage, embuscades connues, route de secours…"><textarea className={inputCls + " min-h-[70px] resize-y"} value={d.itineraire} onChange={(e) => set("itineraire", e.target.value.slice(0, 600))} placeholder="Passer par le pont de Flatneck, éviter la route principale…" /></Field>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Distance"><input className={inputCls} value={d.distance} onChange={(e) => set("distance", e.target.value.slice(0, 40))} placeholder="~420 km" /></Field>
            <Field label="Durée estimée"><input className={inputCls} value={d.duree} onChange={(e) => set("duree", e.target.value.slice(0, 40))} placeholder="4 h 30" /></Field>
            <Field label="Terrain"><Sel options={TERRAINS} value={d.terrain} onChange={(v) => set("terrain", v)} vide="— Terrain —" /></Field>
          </div>
          <label className="flex items-center gap-2 text-[0.82rem]"><input type="checkbox" checked={d.zoneDangereuse} onChange={(e) => set("zoneDangereuse", e.target.checked)} className="h-4 w-4 accent-[var(--oxblood)]" /> Zone dangereuse signalée</label>
        </CarteForm>

        <CarteForm titre="Planification" icon={CalendarClock}>
          <Field label="Phase de départ" req><Puces options={PHASES} value={d.phase} onChange={(v) => set("phase", v)} /></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Date de début" req><input className={inputCls} type="date" value={d.dateDebut} onChange={(e) => set("dateDebut", e.target.value)} /></Field>
            <Field label="Heure de début"><input className={inputCls} type="time" value={d.heureDebut} onChange={(e) => set("heureDebut", e.target.value)} /></Field>
            <Field label="Date de fin estimée"><input className={inputCls} type="date" value={d.dateFin} onChange={(e) => set("dateFin", e.target.value)} /></Field>
            <Field label="Heure de fin estimée"><input className={inputCls} type="time" value={d.heureFin} onChange={(e) => set("heureFin", e.target.value)} /></Field>
          </div>
          <Field label="Conditions météo"><div className="flex items-center gap-1.5"><CloudSun className="h-4 w-4 text-faint" /><Sel options={METEOS} value={d.meteo} onChange={(v) => set("meteo", v)} vide="— Météo —" /></div></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Point de rassemblement"><input className={inputCls} value={d.pointRassemblement} onChange={(e) => set("pointRassemblement", e.target.value.slice(0, 120))} placeholder="Grange à l'ouest de Valentine" /></Field>
            <Field label="Heure du briefing"><input className={inputCls} type="time" value={d.heureBriefing} onChange={(e) => set("heureBriefing", e.target.value)} /></Field>
          </div>
          <Field label="Notes logistiques"><textarea className={inputCls + " min-h-[70px] resize-y"} value={d.notesLogistiques} onChange={(e) => set("notesLogistiques", e.target.value.slice(0, 500))} placeholder="Prévoir ravitaillement en route, point de regroupement…" /><Compteur v={d.notesLogistiques} max={500} /></Field>
        </CarteForm>
      </div>
    );

    if (step === 4) return (
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <CarteForm titre="Rémunération & partage" icon={Wallet}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Prime globale"><input className={inputCls} value={d.primeGlobale} onChange={(e) => set("primeGlobale", e.target.value.slice(0, 40))} placeholder="$800" /></Field>
            <Field label="Prime individuelle"><input className={inputCls} value={d.primeIndividuelle} onChange={(e) => set("primeIndividuelle", e.target.value.slice(0, 40))} placeholder="$150 / agent" /></Field>
            <Field label="Bonus / récompense"><input className={inputCls} value={d.bonus} onChange={(e) => set("bonus", e.target.value.slice(0, 120))} placeholder="Cheval de race si aucune perte" /></Field>
            <Field label="Partage du butin"><input className={inputCls} value={d.partageButin} onChange={(e) => set("partageButin", e.target.value.slice(0, 120))} placeholder="60% compagnie / 40% équipe" /></Field>
          </div>
        </CarteForm>

        <CarteForm titre="Résumé de l'engagement" icon={Coins}>
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between rounded-lg border border-border bg-surface-2 px-3 py-2.5"><span className="text-[0.78rem] text-muted">Prime globale</span><b className="font-num text-[1.05rem]" style={{ color: "var(--brass)" }}>{money(d.primeGlobale)}</b></div>
            <div className="flex items-center justify-between rounded-lg border border-border bg-surface-2 px-3 py-2.5"><span className="text-[0.78rem] text-muted">Estimation par agent <span className="text-faint">({nombre(d.agents) || 0})</span></span><b className="font-num text-[1.05rem] text-ink">{primePerAgent ? `$${primePerAgent.toLocaleString("fr-FR")}` : "—"}</b></div>
            <div className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-[0.76rem] text-faint">Le paiement réel s&apos;effectue à la <b className="text-muted">clôture de l&apos;opération</b> (crédit du coffre du pôle). Ces montants figurent au dossier comme engagement.</div>
          </div>
        </CarteForm>
      </div>
    );

    // step 5
    return (
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <CarteForm titre="Consignes opérationnelles" icon={ScrollText}>
          <Field label="Consignes générales"><textarea className={inputCls + " min-h-[70px] resize-y"} value={d.consignes} onChange={(e) => set("consignes", e.target.value.slice(0, 800))} placeholder="Rester discret, éviter les routes principales…" /></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Ordre d'ouverture du feu"><input className={inputCls} value={d.ordreFeu} onChange={(e) => set("ordreFeu", e.target.value.slice(0, 200))} placeholder="Riposte seulement si attaqués" /></Field>
            <Field label="Gestion des civils"><input className={inputCls} value={d.gestionCivils} onChange={(e) => set("gestionCivils", e.target.value.slice(0, 200))} placeholder="Aucun civil pris pour cible" /></Field>
            <Field label="Gestion des blessés"><input className={inputCls} value={d.gestionBlesses} onChange={(e) => set("gestionBlesses", e.target.value.slice(0, 200))} placeholder="Repli vers le chariot médical" /></Field>
            <Field label="Procédure d'extraction"><input className={inputCls} value={d.extraction} onChange={(e) => set("extraction", e.target.value.slice(0, 200))} placeholder="Point de secours : ferme de Lagras" /></Field>
            <Field label="Plan de secours (échec)"><input className={inputCls} value={d.planSecours} onChange={(e) => set("planSecours", e.target.value.slice(0, 200))} placeholder="Dispersion et rendez-vous au QG" /></Field>
            <Field label="Communication (télégraphe / codes)"><input className={inputCls} value={d.comRadio} onChange={(e) => set("comRadio", e.target.value.slice(0, 200))} placeholder="Signal : deux coups de feu = repli" /></Field>
          </div>
        </CarteForm>

        <div className="flex flex-col gap-4">
          <div className="rounded-[14px] border p-4" style={{ borderColor: "color-mix(in srgb,var(--good) 40%,var(--border))", background: "color-mix(in srgb,var(--good) 6%,transparent)" }}>
            <div className="flex items-center gap-2 text-[0.82rem] font-semibold" style={{ color: "var(--good)" }}><ClipboardCheck className="h-4 w-4" /> Prêt à ouvrir le dossier</div>
            <p className="mt-1 text-[0.8rem] text-muted">Vérifie l&apos;aperçu du dossier à droite. « Valider &amp; ouvrir le dossier » crée l&apos;opération dans les registres — elle apparaîtra dans « En cours » / « Préparation » et sera annoncée sur Discord.</p>
          </div>
          {alertes.length ? (
            <div className="rounded-[14px] border border-border bg-surface p-4 text-[0.78rem]">
              <div className="mb-1.5 flex items-center gap-1.5 font-semibold" style={{ color: "var(--warn)" }}><AlertTriangle className="h-3.5 w-3.5" /> {alertes.length} point(s) à revoir</div>
              <ul className="flex flex-col gap-1 text-muted">{alertes.slice(0, 4).map((al, i) => <li key={i}>• {al.t}</li>)}</ul>
            </div>
          ) : (
            <div className="rounded-[14px] border border-border bg-surface p-4 text-[0.82rem] text-faint">✓ Le dossier est cohérent, aucune alerte détectée.</div>
          )}
        </div>
      </div>
    );
  }
}

// ── Contrôles réutilisés ──
function Puces({ options, value, onChange }: { options: { key: string; label: string }[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => { const on = value === o.key; return (
        <button key={o.key} onClick={() => onChange(o.key)} className="rounded-lg border px-2.5 py-1.5 text-[0.78rem] font-semibold transition" style={{ borderColor: on ? "var(--accent)" : "var(--border)", background: on ? "color-mix(in srgb,var(--accent) 12%,transparent)" : "var(--surface-2)", color: on ? "var(--accent)" : "var(--muted)" }}>{o.label}</button>
      ); })}
    </div>
  );
}
function Sel({ options, value, onChange, vide }: { options: string[]; value: string; onChange: (v: string) => void; vide: string }) {
  return <select className={inputCls} value={value} onChange={(e) => onChange(e.target.value)}><option value="">{vide}</option>{options.map((o) => <option key={o} value={o}>{o}</option>)}</select>;
}
function SelMembre({ membres, value, onChange }: { membres: MembreLite[]; value: string; onChange: (v: string) => void }) {
  return (
    <select className={inputCls} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">— À désigner —</option>
      {membres.map((m) => <option key={m.id} value={m.nom}>{m.nom}</option>)}
    </select>
  );
}
