"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Beef, Plus, Minus, Loader2, Camera, AlertTriangle, History, X, Check, Search,
  ArrowLeftRight, Trash2, SlidersHorizontal, Package, TrendingDown, Clock, Settings2, ScanLine, ChevronDown,
} from "lucide-react";
import type { ChasseData, ChasseZone, ChasseStockRow } from "@/lib/chasse";
import type { LigneStock } from "@/lib/vision";
import { Modal, Flash, Champ, Picker, inputCls } from "@/components/edit-ui";
import { PhotoDrop } from "@/components/photo-drop";
import {
  ajusterChasse, deplacerChasse, definirSeuilChasse, supprimerRessourceChasse,
  definirCapaciteChasse, lireStockChasse, importerStockChasse,
} from "@/app/(app)/chasse/actions";

type Mode = "add" | "remove" | "set";
type FlashMsg = { t: "ok" | "bad"; m: string } | null;

const CHIPS = [1, 5, 10, 25, 50, 100];
const RESSOURCES_SUGGEREES = [
  "Viande de cerf", "Viande de bison", "Viande de sanglier", "Viande de lapin",
  "Viande de dinde", "Viande de canard", "Peaux", "Plumes", "Graisse", "Cornes", "Carcasses",
];
const CATS = ["Viandes", "Peaux & Cuirs", "Plumes", "Matières", "Carcasses", "Autre"];

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
function emoji(nom: string) {
  const n = norm(nom);
  if (n.includes("cerf")) return "🦌"; if (n.includes("bison")) return "🐃"; if (n.includes("sanglier")) return "🐗";
  if (n.includes("lapin")) return "🐇"; if (n.includes("dinde")) return "🦃"; if (n.includes("canard")) return "🦆";
  if (n.includes("ours")) return "🐻"; if (n.includes("peau") || n.includes("cuir")) return "🟫";
  if (n.includes("plume")) return "🪶"; if (n.includes("graisse")) return "🧈";
  if (n.includes("corne") || n.includes("bois")) return "🐏"; if (n.includes("carcasse") || n.includes("os")) return "🦴";
  if (n.includes("oeuf") || n.includes("œuf")) return "🥚"; if (n.includes("viande") || n.includes("chair")) return "🥩";
  return "📦";
}
function catAuto(nom: string) {
  const n = norm(nom);
  if (n.includes("viande") || n.includes("chair")) return "Viandes";
  if (n.includes("peau") || n.includes("cuir")) return "Peaux & Cuirs";
  if (n.includes("plume")) return "Plumes";
  if (n.includes("carcasse")) return "Carcasses";
  if (n.includes("graisse") || n.includes("corne") || n.includes("os") || n.includes("bois")) return "Matières";
  return "Autre";
}
const dateFR = (s: string | null) => { if (!s) return ""; try { return new Date(s).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }); } catch { return ""; } };
const isToday = (s: string | null) => { if (!s) return false; try { const d = new Date(s), n = new Date(); return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate(); } catch { return false; } };
const zoneNom = (zones: ChasseZone[], id: string) => zones.find((z) => z.id === id)?.nom || id;

export function ChasseModule({ data }: { data: ChasseData }) {
  const router = useRouter();
  // Rendu neutre côté serveur pour les valeurs qui dépendent de l'heure (évite
  // tout décalage d'hydratation) — révélées après montage client.
  const [monte, setMonte] = useState(false);
  useEffect(() => { setMonte(true); }, []);

  const [items, setItems] = useState<ChasseStockRow[]>(data.stock);
  const [zones, setZones] = useState<ChasseZone[]>(data.zones);
  const [vue, setVue] = useState<string>("global");
  const [q, setQ] = useState("");
  const [catFiltre, setCatFiltre] = useState<string>("");
  const [flash, setFlash] = useState<FlashMsg>(null);
  const [pending, setPending] = useState(0);
  const [journal, setJournal] = useState(false);

  // Modales
  const [photo, setPhoto] = useState(false);
  const [nouveau, setNouveau] = useState(false);
  const [transfert, setTransfert] = useState(false);
  const [stepItem, setStepItem] = useState<ChasseStockRow | null>(null);
  const [capZone, setCapZone] = useState<ChasseZone | null>(null);

  const totalGlobal = items.reduce((s, i) => s + i.quantite, 0);

  // Récapitulatif : une ligne par ressource, avec le détail par zone + le total.
  const ressources = useMemo(() => {
    const map = new Map<string, { nom: string; cat: string; total: number; zones: Record<string, number>; seuil: number | null }>();
    for (const it of items) {
      const k = norm(it.nom);
      const e = map.get(k) || { nom: it.nom, cat: it.categorie || catAuto(it.nom), total: 0, zones: {}, seuil: null };
      e.total += it.quantite;
      e.zones[it.zoneId] = (e.zones[it.zoneId] || 0) + it.quantite;
      if (it.seuil != null) e.seuil = Math.max(e.seuil ?? 0, it.seuil);
      map.set(k, e);
    }
    return [...map.values()].sort((a, b) => b.total - a.total || a.nom.localeCompare(b.nom));
  }, [items]);

  const totauxZone = useMemo(() => {
    const m: Record<string, number> = {};
    for (const it of items) m[it.zoneId] = (m[it.zoneId] || 0) + it.quantite;
    return m;
  }, [items]);

  // Alertes automatiques (presque plein / vide / sous le seuil).
  const alertes = useMemo(() => {
    const presquePlein = zones.filter((z) => z.capacite != null && z.capacite > 0 && (totauxZone[z.id] || 0) / z.capacite >= 0.85);
    const sousSeuil = items.filter((i) => i.seuil != null && i.quantite > 0 && i.quantite <= i.seuil);
    const vides = items.filter((i) => i.quantite <= 0);
    return { presquePlein, sousSeuil, vides };
  }, [items, zones, totauxZone]);

  const query = q.trim().toLowerCase();

  // ── Actions optimistes (le total se recalcule instantanément) ──
  async function applique(zoneId: string, nom: string, mode: Mode, qte: number, extra?: { categorie?: string; seuil?: number | null }) {
    const qn = Math.abs(Math.round(qte)) || 0;
    if (mode !== "set" && qn === 0) return;
    setItems((prev) => {
      const i = prev.findIndex((x) => x.zoneId === zoneId && norm(x.nom) === norm(nom));
      if (i === -1) {
        if (mode === "remove" || qn === 0) return prev;
        return [...prev, { id: `tmp-${zoneId}-${norm(nom)}`, zoneId, nom, quantite: qn, seuil: extra?.seuil ?? null, categorie: extra?.categorie ?? catAuto(nom), updatedAt: null }];
      }
      const copy = [...prev];
      const cur = copy[i];
      const apres = mode === "add" ? cur.quantite + qn : mode === "remove" ? Math.max(0, cur.quantite - qn) : qn;
      copy[i] = { ...cur, quantite: apres, ...(extra?.categorie ? { categorie: extra.categorie } : {}), ...(extra?.seuil !== undefined ? { seuil: extra.seuil } : {}) };
      return copy;
    });
    setPending((p) => p + 1);
    const r = await ajusterChasse({ zoneId, nom, mode, quantite: qn, categorie: extra?.categorie, seuil: extra?.seuil });
    setPending((p) => Math.max(0, p - 1));
    if (!r.ok) setFlash({ t: "bad", m: r.error || "Échec — le changement pourrait ne pas être enregistré." });
  }

  async function transfere(nom: string, de: string, vers: string, qte: number) {
    const qn = Math.abs(Math.round(qte)) || 0;
    if (qn <= 0 || de === vers) return;
    setItems((prev) => {
      const copy = [...prev];
      const di = copy.findIndex((x) => x.zoneId === de && norm(x.nom) === norm(nom));
      if (di === -1) return prev;
      const moved = Math.min(qn, copy[di].quantite);
      if (moved <= 0) return prev;
      copy[di] = { ...copy[di], quantite: copy[di].quantite - moved };
      const vi = copy.findIndex((x) => x.zoneId === vers && norm(x.nom) === norm(nom));
      if (vi === -1) copy.push({ id: `tmp-${vers}-${norm(nom)}`, zoneId: vers, nom, quantite: moved, seuil: null, categorie: copy[di].categorie, updatedAt: null });
      else copy[vi] = { ...copy[vi], quantite: copy[vi].quantite + moved };
      return copy;
    });
    setPending((p) => p + 1);
    const r = await deplacerChasse({ nom, deZone: de, versZone: vers, quantite: qn });
    setPending((p) => Math.max(0, p - 1));
    if (!r.ok) setFlash({ t: "bad", m: r.error || "Transfert impossible." }); else router.refresh();
  }

  async function supprime(zoneId: string, nom: string) {
    setItems((prev) => prev.filter((x) => !(x.zoneId === zoneId && norm(x.nom) === norm(nom))));
    const r = await supprimerRessourceChasse({ zoneId, nom });
    if (!r.ok) setFlash({ t: "bad", m: r.error || "Suppression impossible." }); else router.refresh();
  }

  async function majSeuil(zoneId: string, nom: string, seuil: number | null) {
    setItems((prev) => prev.map((x) => (x.zoneId === zoneId && norm(x.nom) === norm(nom) ? { ...x, seuil } : x)));
    const r = await definirSeuilChasse({ zoneId, nom, seuil });
    if (!r.ok) setFlash({ t: "bad", m: r.error || "Impossible d'enregistrer le seuil." });
  }

  // Applique un import OCR en optimiste puis reconcilie côté serveur.
  function mergeImport(zoneId: string, lignes: LigneStock[], mode: "add" | "set") {
    setItems((prev) => {
      const copy = [...prev];
      for (const l of lignes) {
        const nom = (l.nom || "").trim(); const qn = Math.max(0, Math.round(l.quantite || 0));
        if (!nom) continue;
        const i = copy.findIndex((x) => x.zoneId === zoneId && norm(x.nom) === norm(nom));
        if (i === -1) { if (qn > 0) copy.push({ id: `tmp-${zoneId}-${norm(nom)}`, zoneId, nom, quantite: qn, seuil: null, categorie: catAuto(nom), updatedAt: null }); }
        else copy[i] = { ...copy[i], quantite: mode === "set" ? qn : copy[i].quantite + qn };
      }
      return copy;
    });
  }

  const nbRessources = ressources.length;

  return (
    <>
      {/* En-tête */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-2.5">
          <h3 className="text-[0.8rem] font-semibold uppercase tracking-[0.06em] text-muted">Chasse — charrettes &amp; ressources</h3>
          <span className="font-num text-[0.8rem] text-faint">{totalGlobal} u. · {nbRessources} ressource{nbRessources > 1 ? "s" : ""}</span>
          {pending > 0 ? <span className="inline-flex items-center gap-1 text-[0.72rem] text-faint"><Loader2 className="h-3 w-3 animate-spin" /> synchronisation…</span> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => setPhoto(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-[0.76rem] font-semibold text-ink transition hover:border-border-2"><Camera className="h-3.5 w-3.5" /> Photo → stock</button>
          <button onClick={() => setTransfert(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-[0.76rem] font-semibold text-ink transition hover:border-border-2"><ArrowLeftRight className="h-3.5 w-3.5" /> Transférer</button>
          <button onClick={() => setNouveau(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-[0.76rem] font-semibold text-ink transition hover:border-border-2"><Plus className="h-3.5 w-3.5" strokeWidth={2} /> Ajouter</button>
        </div>
      </div>

      {!data.pret ? (
        <div className="mb-3 flex items-start gap-2 rounded-[10px] border px-3 py-2.5 text-[0.82rem]" style={{ color: "var(--warn)", borderColor: "color-mix(in srgb,var(--warn) 45%,var(--border))", background: "color-mix(in srgb,var(--warn) 10%,transparent)" }}>
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Le module attend sa base de données. Lance <b>web/prisma/sql/chasse.sql</b> dans Supabase → SQL Editor, puis recharge. En attendant, l&apos;affichage reste vide.</span>
        </div>
      ) : null}

      {flash ? <div className="mb-3"><Flash tone={flash.t === "ok" ? "good" : "bad"}>{flash.m}</Flash></div> : null}

      {/* Tableau de bord (statistiques) */}
      <StatsRow items={items} zones={zones} totauxZone={totauxZone} ressources={ressources} data={data} monte={monte} />

      {/* Alertes automatiques */}
      <AlertesRow alertes={alertes} zones={zones} totauxZone={totauxZone} onVoir={(zoneId) => setVue(zoneId)} />

      {/* Sélecteur de vue : globale + une par charrette */}
      <div className="mb-3">
        <Picker
          options={[{ key: "global", label: "🗺️ Vue globale" }, ...zones.map((z) => ({ key: z.id, label: z.nom }))]}
          value={vue}
          onChange={setVue}
        />
      </div>

      {/* Recherche + filtre catégorie */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[180px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
          <input className={inputCls + " pl-8"} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher une ressource…" />
        </div>
        <select value={catFiltre} onChange={(e) => setCatFiltre(e.target.value)} className={inputCls + " max-w-[190px]"}>
          <option value="">Toutes catégories</option>
          {CATS.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {vue === "global" ? (
        <RecapTable ressources={ressources} zones={zones} query={query} catFiltre={catFiltre} />
      ) : (
        <ZoneVue
          zone={zones.find((z) => z.id === vue)!}
          items={items.filter((i) => i.zoneId === vue)}
          totalZone={totauxZone[vue] || 0}
          query={query}
          catFiltre={catFiltre}
          applique={applique}
          onStep={setStepItem}
          onSupprime={supprime}
          onCap={() => setCapZone(zones.find((z) => z.id === vue) || null)}
        />
      )}

      {/* Historique complet */}
      <HistoryPanel data={data} zones={zones} open={journal} onToggle={() => setJournal((v) => !v)} monte={monte} />

      {/* Modales */}
      {photo ? <PhotoModal zones={zones} defaultZone={vue !== "global" ? vue : zones[0]?.id || "c1"} onClose={() => setPhoto(false)} onApplied={(zoneId, lignes, mode) => { mergeImport(zoneId, lignes, mode); router.refresh(); }} setFlash={setFlash} /> : null}
      {nouveau ? <NouveauModal zones={zones} defaultZone={vue !== "global" ? vue : zones[0]?.id || "c1"} onClose={() => setNouveau(false)} onCreer={(zoneId, nom, qte, cat) => applique(zoneId, nom, "add", qte, { categorie: cat })} /> : null}
      {transfert ? <TransfertModal zones={zones} items={items} onClose={() => setTransfert(false)} onTransfere={transfere} /> : null}
      {stepItem ? <StepModal item={stepItem} onClose={() => setStepItem(null)} onApply={(mode, qte) => { applique(stepItem.zoneId, stepItem.nom, mode, qte); setStepItem(null); }} onSeuil={(seuil) => { majSeuil(stepItem.zoneId, stepItem.nom, seuil); }} /> : null}
      {capZone ? <CapaciteModal zone={capZone} used={totauxZone[capZone.id] || 0} onClose={() => setCapZone(null)} onSave={(cap) => { setZones((zs) => zs.map((z) => (z.id === capZone.id ? { ...z, capacite: cap } : z))); definirCapaciteChasse({ zoneId: capZone.id, nom: capZone.nom, capacite: cap }).then((r) => { if (!r.ok) setFlash({ t: "bad", m: r.error || "Impossible." }); }); setCapZone(null); }} /> : null}
    </>
  );
}

// ── Statistiques ────────────────────────────────────────────────
function StatsRow({ items, zones, totauxZone, ressources, data, monte }: {
  items: ChasseStockRow[]; zones: ChasseZone[]; totauxZone: Record<string, number>;
  ressources: { nom: string; total: number }[]; data: ChasseData; monte: boolean;
}) {
  const total = items.reduce((s, i) => s + i.quantite, 0);
  const top = ressources[0];
  const faibles = items.filter((i) => (i.seuil != null && i.quantite <= i.seuil) || i.quantite === 0).length;
  const majAuj = monte ? data.mouvements.filter((m) => isToday(m.createdAt)).length : null;
  const dernier = data.mouvements[0];
  const dernierOcr = data.mouvements.find((m) => m.type === "ocr");

  return (
    <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
      <Tile icon={<Package className="h-4 w-4" />} label="Stock total" value={String(total)} tone="var(--accent)" />
      {zones.map((z) => <Tile key={z.id} icon={<Beef className="h-4 w-4" />} label={z.nom} value={String(totauxZone[z.id] || 0)} tone="var(--muted)" />)}
      <Tile icon={<TrendingDown className="h-4 w-4" />} label="Ressources faibles" value={String(faibles)} tone={faibles ? "var(--warn)" : "var(--good)"} />
      <Tile icon={<Clock className="h-4 w-4" />} label="MAJ aujourd'hui" value={majAuj == null ? "—" : String(majAuj)} tone="var(--muted)" />
      <Tile icon={<Beef className="h-4 w-4" />} label="Plus stockée" value={top ? `${emoji(top.nom)} ${top.total}` : "—"} sub={top?.nom} tone="var(--muted)" />
      <Tile icon={<ScanLine className="h-4 w-4" />} label="Dernier import OCR" value={monte && dernierOcr ? dateFR(dernierOcr.createdAt) : monte ? "—" : "…"} sub={monte && dernier ? `Modif. ${dateFR(dernier.createdAt)}` : undefined} tone="var(--muted)" small />
    </div>
  );
}

function Tile({ icon, label, value, sub, tone, small }: { icon: React.ReactNode; label: string; value: string; sub?: string; tone: string; small?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-[12px] border border-border bg-surface-2 px-3 py-2.5">
      <span className="flex items-center gap-1.5 text-[0.68rem] uppercase tracking-[0.05em] text-faint" style={{ color: "color-mix(in srgb," + tone + " 70%,var(--faint))" }}>{icon} {label}</span>
      <span className={"font-num font-semibold " + (small ? "text-[0.9rem]" : "text-[1.15rem]")} style={{ color: tone }}>{value}</span>
      {sub ? <span className="truncate text-[0.68rem] text-faint">{sub}</span> : null}
    </div>
  );
}

// ── Alertes ─────────────────────────────────────────────────────
function AlertesRow({ alertes, zones, totauxZone, onVoir }: {
  alertes: { presquePlein: ChasseZone[]; sousSeuil: ChasseStockRow[]; vides: ChasseStockRow[] };
  zones: ChasseZone[]; totauxZone: Record<string, number>; onVoir: (zoneId: string) => void;
}) {
  const { presquePlein, sousSeuil, vides } = alertes;
  if (!presquePlein.length && !sousSeuil.length && !vides.length) return null;
  return (
    <div className="mb-3 flex flex-col gap-1.5">
      {presquePlein.map((z) => (
        <button key={z.id} onClick={() => onVoir(z.id)} className="flex items-center gap-2 rounded-[10px] border px-3 py-2 text-left text-[0.8rem] transition hover:brightness-110" style={{ color: "var(--warn)", borderColor: "color-mix(in srgb,var(--warn) 45%,var(--border))", background: "color-mix(in srgb,var(--warn) 10%,transparent)" }}>
          <AlertTriangle className="h-4 w-4 shrink-0" /> <b>{z.nom}</b> presque pleine — {totauxZone[z.id] || 0} / {z.capacite} ({Math.round(((totauxZone[z.id] || 0) / (z.capacite || 1)) * 100)} %).
        </button>
      ))}
      {sousSeuil.length ? (
        <div className="flex flex-wrap items-center gap-1.5 rounded-[10px] border px-3 py-2 text-[0.8rem]" style={{ color: "var(--warn)", borderColor: "color-mix(in srgb,var(--warn) 40%,var(--border))", background: "color-mix(in srgb,var(--warn) 8%,transparent)" }}>
          <TrendingDown className="h-4 w-4 shrink-0" /> <b>{sousSeuil.length}</b> ressource(s) sous leur seuil :
          {sousSeuil.slice(0, 6).map((i) => <button key={i.id} onClick={() => onVoir(i.zoneId)} className="rounded-full border border-border bg-surface px-2 py-0.5 text-[0.72rem] hover:text-ink">{emoji(i.nom)} {i.nom} ({i.quantite})</button>)}
        </div>
      ) : null}
      {vides.length ? (
        <div className="flex flex-wrap items-center gap-1.5 rounded-[10px] border px-3 py-2 text-[0.8rem]" style={{ color: "var(--oxblood)", borderColor: "color-mix(in srgb,var(--oxblood) 40%,var(--border))", background: "color-mix(in srgb,var(--oxblood) 8%,transparent)" }}>
          <AlertTriangle className="h-4 w-4 shrink-0" /> <b>{vides.length}</b> ressource(s) à 0 — à réapprovisionner.
        </div>
      ) : null}
    </div>
  );
}

// ── Vue globale : tableau récapitulatif (somme automatique) ──────
function RecapTable({ ressources, zones, query, catFiltre }: {
  ressources: { nom: string; cat: string; total: number; zones: Record<string, number>; seuil: number | null }[];
  zones: ChasseZone[]; query: string; catFiltre: string;
}) {
  const list = ressources.filter((r) => (!query || r.nom.toLowerCase().includes(query)) && (!catFiltre || r.cat === catFiltre));
  if (!list.length) return <p className="px-1 py-8 text-center text-[0.84rem] text-faint">{query || catFiltre ? "Aucune ressource ne correspond." : "Aucune ressource — ajoute-en une, ou importe une photo du stock."}</p>;
  const totaux = zones.map((z) => list.reduce((s, r) => s + (r.zones[z.id] || 0), 0));
  const grand = totaux.reduce((s, n) => s + n, 0);
  return (
    <div className="overflow-x-auto rounded-[12px] border border-border">
      <table className="w-full min-w-[520px] border-collapse text-left text-[0.85rem]">
        <thead>
          <tr className="text-[0.68rem] uppercase tracking-[0.05em] text-faint">
            <th className="border-b border-border px-3 py-2 font-semibold">Ressource</th>
            {zones.map((z) => <th key={z.id} className="border-b border-border px-3 py-2 text-right font-semibold">{z.nom}</th>)}
            <th className="border-b border-border px-3 py-2 text-right font-semibold" style={{ color: "var(--accent)" }}>Total</th>
          </tr>
        </thead>
        <tbody>
          {list.map((r) => (
            <tr key={r.nom} className="hover:bg-[color-mix(in_srgb,var(--ink)_4%,transparent)]">
              <td className="border-b border-border px-3 py-2"><span className="mr-1.5">{emoji(r.nom)}</span>{r.nom}{r.seuil != null && r.total <= r.seuil ? <span className="ml-1.5 align-middle text-[0.68rem]" style={{ color: "var(--warn)" }}>▼ seuil {r.seuil}</span> : null}</td>
              {zones.map((z) => <td key={z.id} className="border-b border-border px-3 py-2 text-right font-num text-muted">{r.zones[z.id] || <span className="text-faint">—</span>}</td>)}
              <td className="border-b border-border px-3 py-2 text-right font-num font-semibold" style={{ color: "var(--accent)" }}>{r.total}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="text-[0.8rem] font-semibold">
            <td className="px-3 py-2">Total</td>
            {totaux.map((t, i) => <td key={i} className="px-3 py-2 text-right font-num text-muted">{t}</td>)}
            <td className="px-3 py-2 text-right font-num" style={{ color: "var(--accent)" }}>{grand}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// ── Vue d'une charrette ─────────────────────────────────────────
function ZoneVue({ zone, items, totalZone, query, catFiltre, applique, onStep, onSupprime, onCap }: {
  zone: ChasseZone; items: ChasseStockRow[]; totalZone: number; query: string; catFiltre: string;
  applique: (zoneId: string, nom: string, mode: Mode, qte: number) => void;
  onStep: (it: ChasseStockRow) => void; onSupprime: (zoneId: string, nom: string) => void; onCap: () => void;
}) {
  const list = items
    .filter((i) => (!query || i.nom.toLowerCase().includes(query)) && (!catFiltre || (i.categorie || catAuto(i.nom)) === catFiltre))
    .sort((a, b) => b.quantite - a.quantite || a.nom.localeCompare(b.nom));
  const pct = zone.capacite && zone.capacite > 0 ? Math.min(100, Math.round((totalZone / zone.capacite) * 100)) : null;
  const barColor = pct == null ? "var(--muted)" : pct >= 90 ? "var(--oxblood)" : pct >= 70 ? "var(--warn)" : "var(--good)";

  return (
    <div className="flex flex-col gap-3">
      {/* Capacité */}
      <div className="rounded-[12px] border border-border bg-surface-2 px-3 py-2.5">
        <div className="mb-1.5 flex items-center justify-between gap-2 text-[0.8rem]">
          <span className="font-semibold">{zone.nom}</span>
          <span className="text-faint">
            {zone.capacite != null ? <>{totalZone} / {zone.capacite} u. · <b style={{ color: barColor }}>{Math.max(0, zone.capacite - totalZone)} restant{zone.capacite - totalZone > 1 ? "s" : ""}</b></> : <>{totalZone} u. · capacité non définie</>}
            <button onClick={onCap} className="ml-2 inline-flex items-center gap-1 text-faint hover:text-ink" title="Définir la capacité"><Settings2 className="h-3.5 w-3.5" /></button>
          </span>
        </div>
        {pct != null ? (
          <div className="h-2 w-full overflow-hidden rounded-full" style={{ background: "color-mix(in srgb,var(--ink) 8%,transparent)" }}>
            <div className="h-full rounded-full transition-all" style={{ width: pct + "%", background: barColor }} />
          </div>
        ) : null}
      </div>

      {list.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
          <Beef className="h-6 w-6 text-faint" strokeWidth={1.6} />
          <p className="max-w-md text-[0.82rem] leading-relaxed text-muted">{query || catFiltre ? "Aucune ressource ne correspond." : `${zone.nom} est vide. Ajoute une ressource ou importe une photo du stock.`}</p>
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((it) => <ZoneCard key={it.id} it={it} applique={applique} onStep={onStep} onSupprime={onSupprime} />)}
        </div>
      )}
    </div>
  );
}

function ZoneCard({ it, applique, onStep, onSupprime }: {
  it: ChasseStockRow; applique: (zoneId: string, nom: string, mode: Mode, qte: number) => void;
  onStep: (it: ChasseStockRow) => void; onSupprime: (zoneId: string, nom: string) => void;
}) {
  const [confirm, setConfirm] = useState(false);
  const bas = it.seuil != null && it.quantite <= it.seuil;
  return (
    <div className="flex items-center gap-2 rounded-[10px] border border-border bg-surface-2 px-2.5 py-2" style={it.quantite <= 0 ? { borderColor: "color-mix(in srgb,var(--oxblood) 45%,var(--border))" } : undefined}>
      <span className="text-[1.15rem]">{emoji(it.nom)}</span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[0.84rem] font-medium">{it.nom}</div>
        {bas ? <div className="flex items-center gap-1 text-[0.68rem]" style={{ color: "var(--warn)" }}><AlertTriangle className="h-3 w-3" /> sous le seuil ({it.seuil})</div>
          : it.quantite <= 0 ? <div className="text-[0.68rem]" style={{ color: "var(--oxblood)" }}>à 0</div>
          : <div className="text-[0.66rem] uppercase tracking-[0.05em] text-faint">{it.categorie || catAuto(it.nom)}</div>}
      </div>
      <button onClick={() => applique(it.zoneId, it.nom, "remove", 1)} className="grid h-6 w-6 place-items-center rounded-md border border-border text-muted hover:text-ink" aria-label="Retirer 1"><Minus className="h-3.5 w-3.5" /></button>
      <button onClick={() => onStep(it)} className="min-w-[2rem] rounded-md px-1 text-center font-num text-[0.9rem] font-semibold hover:bg-[color-mix(in_srgb,var(--ink)_6%,transparent)]" title="Montant exact / seuil">{it.quantite}</button>
      <button onClick={() => applique(it.zoneId, it.nom, "add", 1)} className="grid h-6 w-6 place-items-center rounded-md border border-border text-muted hover:text-ink" aria-label="Ajouter 1"><Plus className="h-3.5 w-3.5" /></button>
      <button onClick={() => onStep(it)} className="grid h-6 w-6 place-items-center rounded-md border border-border text-faint hover:text-ink" aria-label="Montant exact"><SlidersHorizontal className="h-3.5 w-3.5" /></button>
      {confirm ? (
        <span className="inline-flex items-center gap-1 text-[0.72rem]">
          <button onClick={() => { onSupprime(it.zoneId, it.nom); setConfirm(false); }} className="rounded px-1.5 py-0.5 font-semibold text-black/85" style={{ background: "var(--oxblood)" }}>Oui</button>
          <button onClick={() => setConfirm(false)} className="text-muted hover:text-ink">Non</button>
        </span>
      ) : (
        <button onClick={() => setConfirm(true)} className="grid h-6 w-6 place-items-center rounded-md border border-border text-faint hover:text-ink" aria-label="Supprimer" title="Supprimer la ressource"><Trash2 className="h-3.5 w-3.5" /></button>
      )}
    </div>
  );
}

// ── Historique ──────────────────────────────────────────────────
const TYPE_LABEL: Record<string, { t: string; c: string }> = {
  ajout: { t: "Ajout", c: "var(--good)" }, retrait: { t: "Retrait", c: "var(--warn)" },
  correction: { t: "Correction", c: "var(--accent)" }, transfert: { t: "Transfert", c: "var(--muted)" },
  ocr: { t: "Import OCR", c: "var(--accent)" }, suppression: { t: "Suppression", c: "var(--oxblood)" },
};

function HistoryPanel({ data, zones, open, onToggle, monte }: { data: ChasseData; zones: ChasseZone[]; open: boolean; onToggle: () => void; monte: boolean }) {
  if (!data.mouvements.length) return null;
  return (
    <div className="mt-4 border-t border-border pt-3">
      <button onClick={onToggle} className="inline-flex items-center gap-1.5 text-[0.74rem] font-semibold text-muted hover:text-ink"><History className="h-3.5 w-3.5" /> Historique complet ({data.mouvements.length}) <ChevronDown className={"h-3.5 w-3.5 transition-transform " + (open ? "rotate-180" : "")} /></button>
      {open ? (
        <div className="mt-2 flex flex-col gap-1">
          {data.mouvements.map((m) => {
            const meta = TYPE_LABEL[m.type] || { t: m.type, c: "var(--muted)" };
            return (
              <div key={m.id} className="flex items-center justify-between gap-3 rounded-[8px] border border-border bg-surface-2 px-2.5 py-1.5 text-[0.78rem]">
                <span className="min-w-0 truncate">
                  <span className="mr-1.5 rounded px-1.5 py-0.5 text-[0.66rem] font-bold" style={{ color: meta.c, background: "color-mix(in srgb," + meta.c + " 14%,transparent)" }}>{meta.t}</span>
                  {emoji(m.nom)} <b>{m.nom}</b>{" "}
                  {m.type === "transfert" && m.cibleZoneId ? <span className="text-faint">{zoneNom(zones, m.zoneId)} → {zoneNom(zones, m.cibleZoneId)}</span> : <span className="text-faint">{zoneNom(zones, m.zoneId)}</span>}
                  {m.avant != null && m.apres != null ? <span className="text-faint"> · {m.avant} → {m.apres}</span> : null}
                </span>
                <span className="shrink-0 text-faint">{m.par ? `${m.par} · ` : ""}{monte ? dateFR(m.createdAt) : ""}</span>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

// ── Montant exact + seuil ───────────────────────────────────────
function StepModal({ item, onClose, onApply, onSeuil }: { item: ChasseStockRow; onClose: () => void; onApply: (mode: Mode, qte: number) => void; onSeuil: (seuil: number | null) => void }) {
  const [mode, setMode] = useState<Mode>("add");
  const [qte, setQte] = useState("");
  const [seuil, setSeuil] = useState(item.seuil == null ? "" : String(item.seuil));
  const modeLabel = mode === "add" ? "Ajouter" : mode === "remove" ? "Retirer" : "Corriger à";
  const apercu = (() => { const q = Math.abs(parseInt(qte, 10) || 0); return mode === "add" ? item.quantite + q : mode === "remove" ? Math.max(0, item.quantite - q) : q; })();

  return (
    <Modal titre={`${emoji(item.nom)} ${item.nom} · ${item.quantite} en stock`} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <Picker options={[{ key: "add", label: "➕ Ajouter" }, { key: "remove", label: "➖ Retirer" }, { key: "set", label: "✏️ Corriger à" }]} value={mode} onChange={(v) => setMode(v as Mode)} />
        <div className="flex flex-wrap gap-1.5">
          {CHIPS.map((c) => <button key={c} onClick={() => setQte(String(c))} className="rounded-lg border px-3 py-1.5 text-[0.82rem] font-semibold transition" style={{ color: qte === String(c) ? "#000" : "var(--accent)", background: qte === String(c) ? "var(--accent)" : "transparent", borderColor: "color-mix(in srgb,var(--accent) 40%,var(--border))" }}>{c}</button>)}
        </div>
        <Champ label="Quantité exacte"><input className={inputCls} type="number" min={0} value={qte} onChange={(e) => setQte(e.target.value)} placeholder="Ex : 25" autoFocus /></Champ>
        <p className="text-[0.8rem] text-muted">{modeLabel} <b>{Math.abs(parseInt(qte, 10) || 0)}</b> → nouveau stock : <b className="font-num" style={{ color: "var(--accent)" }}>{apercu}</b></p>
        <div className="flex items-end gap-2 border-t border-border pt-3">
          <div className="flex-1"><Champ label="Seuil de réappro (alerte)"><input className={inputCls} type="number" min={0} value={seuil} onChange={(e) => setSeuil(e.target.value)} placeholder="ex : 10 — laisse vide pour aucun" /></Champ></div>
          <button onClick={() => { onSeuil(seuil === "" ? null : Math.max(0, parseInt(seuil, 10) || 0)); }} className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-[0.8rem] font-semibold hover:border-border-2">Enregistrer le seuil</button>
        </div>
        <div className="mt-1 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-border bg-surface-2 px-3.5 py-2 text-[0.82rem] font-semibold hover:border-border-2">Fermer</button>
          <button onClick={() => onApply(mode, parseInt(qte, 10) || 0)} disabled={qte === "" || (mode !== "set" && (parseInt(qte, 10) || 0) <= 0)} className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[0.82rem] font-semibold text-black/85 disabled:opacity-50" style={{ background: "var(--accent)" }}><Check className="h-3.5 w-3.5" /> Valider</button>
        </div>
      </div>
    </Modal>
  );
}

// ── Ajouter une ressource ───────────────────────────────────────
function NouveauModal({ zones, defaultZone, onClose, onCreer }: { zones: ChasseZone[]; defaultZone: string; onClose: () => void; onCreer: (zoneId: string, nom: string, qte: number, cat: string) => void }) {
  const [zoneId, setZoneId] = useState(defaultZone);
  const [nom, setNom] = useState("");
  const [cat, setCat] = useState("Viandes");
  const [qte, setQte] = useState("1");
  const [err, setErr] = useState<string | null>(null);

  function choisir(n: string) { setNom(n); setCat(catAuto(n)); }
  function creer() {
    setErr(null);
    if (nom.trim().length < 1) { setErr("Donne un nom à la ressource."); return; }
    onCreer(zoneId, nom.trim(), Number(qte) || 1, cat);
    onClose();
  }
  return (
    <Modal titre="➕ Ajouter une ressource" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1"><span className="text-[0.72rem] uppercase tracking-[0.05em] text-faint">Charrette</span><Picker options={zones.map((z) => ({ key: z.id, label: z.nom }))} value={zoneId} onChange={setZoneId} /></div>
        <div className="flex flex-col gap-1.5">
          <span className="text-[0.72rem] uppercase tracking-[0.05em] text-faint">Ressources courantes</span>
          <div className="flex flex-wrap gap-1.5">{RESSOURCES_SUGGEREES.map((n) => <button key={n} onClick={() => choisir(n)} className="rounded-full border border-border bg-surface-2 px-2.5 py-1 text-[0.74rem] hover:border-border-2">{emoji(n)} {n}</button>)}</div>
        </div>
        <Champ label="Ressource *"><input className={inputCls} value={nom} onChange={(e) => { setNom(e.target.value); }} placeholder="Viande de cerf, Peaux, Plumes…" maxLength={100} autoFocus /></Champ>
        <div className="flex flex-col gap-1"><span className="text-[0.72rem] uppercase tracking-[0.05em] text-faint">Catégorie</span><Picker options={CATS.map((c) => ({ key: c, label: c }))} value={cat} onChange={setCat} /></div>
        <div className="flex flex-col gap-1.5">
          <span className="text-[0.72rem] uppercase tracking-[0.05em] text-faint">Quantité</span>
          <div className="flex flex-wrap gap-1.5">{CHIPS.map((c) => <button key={c} onClick={() => setQte(String(c))} className="rounded-lg border px-3 py-1.5 text-[0.82rem] font-semibold transition" style={{ color: qte === String(c) ? "#000" : "var(--accent)", background: qte === String(c) ? "var(--accent)" : "transparent", borderColor: "color-mix(in srgb,var(--accent) 40%,var(--border))" }}>{c}</button>)}</div>
          <input className={inputCls} type="number" min={1} value={qte} onChange={(e) => setQte(e.target.value)} />
        </div>
        {err ? <p className="text-[0.8rem]" style={{ color: "var(--oxblood)" }}>{err}</p> : null}
        <div className="mt-1 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-border bg-surface-2 px-3.5 py-2 text-[0.82rem] font-semibold hover:border-border-2">Annuler</button>
          <button onClick={creer} className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[0.82rem] font-semibold text-black/85" style={{ background: "var(--accent)" }}><Plus className="h-3.5 w-3.5" strokeWidth={2} /> Ajouter</button>
        </div>
      </div>
    </Modal>
  );
}

// ── Transférer entre charrettes ─────────────────────────────────
function TransfertModal({ zones, items, onClose, onTransfere }: { zones: ChasseZone[]; items: ChasseStockRow[]; onClose: () => void; onTransfere: (nom: string, de: string, vers: string, qte: number) => void }) {
  const [de, setDe] = useState(zones[0]?.id || "c1");
  const [vers, setVers] = useState(zones[1]?.id || zones[0]?.id || "c2");
  const [nom, setNom] = useState("");
  const [qte, setQte] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const dispo = items.filter((i) => i.zoneId === de && i.quantite > 0).sort((a, b) => a.nom.localeCompare(b.nom));
  const enStock = dispo.find((i) => norm(i.nom) === norm(nom))?.quantite ?? 0;

  function go() {
    setErr(null);
    if (de === vers) { setErr("Choisis deux charrettes différentes."); return; }
    if (!nom.trim()) { setErr("Choisis une ressource à déplacer."); return; }
    const q = Math.abs(parseInt(qte, 10) || 0);
    if (q <= 0) { setErr("Quantité invalide."); return; }
    onTransfere(nom.trim(), de, vers, q); onClose();
  }
  return (
    <Modal titre="⇄ Transférer entre charrettes" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-1"><span className="text-[0.72rem] uppercase tracking-[0.05em] text-faint">De</span><Picker options={zones.map((z) => ({ key: z.id, label: z.nom }))} value={de} onChange={(v) => { setDe(v); setNom(""); }} /></div>
          <div className="flex flex-col gap-1"><span className="text-[0.72rem] uppercase tracking-[0.05em] text-faint">Vers</span><Picker options={zones.map((z) => ({ key: z.id, label: z.nom }))} value={vers} onChange={setVers} /></div>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-[0.72rem] uppercase tracking-[0.05em] text-faint">Ressource ({dispo.length} dispo)</span>
          {dispo.length ? <div className="flex flex-wrap gap-1.5">{dispo.map((i) => <button key={i.id} onClick={() => setNom(i.nom)} className="rounded-full border px-2.5 py-1 text-[0.74rem] transition" style={norm(i.nom) === norm(nom) ? { color: "#000", background: "var(--accent)", borderColor: "var(--accent)" } : { borderColor: "var(--border)" }}>{emoji(i.nom)} {i.nom} ({i.quantite})</button>)}</div>
            : <p className="text-[0.8rem] text-faint">Cette charrette est vide.</p>}
        </div>
        <div className="flex items-end gap-2">
          <div className="flex-1"><Champ label={`Quantité${nom ? ` (max ${enStock})` : ""}`}><input className={inputCls} type="number" min={1} max={enStock || undefined} value={qte} onChange={(e) => setQte(e.target.value)} placeholder="Ex : 10" /></Champ></div>
          {enStock > 0 ? <button onClick={() => setQte(String(enStock))} className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-[0.78rem] font-semibold hover:border-border-2">Tout ({enStock})</button> : null}
        </div>
        {err ? <p className="text-[0.8rem]" style={{ color: "var(--oxblood)" }}>{err}</p> : null}
        <div className="mt-1 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-border bg-surface-2 px-3.5 py-2 text-[0.82rem] font-semibold hover:border-border-2">Annuler</button>
          <button onClick={go} className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[0.82rem] font-semibold text-black/85" style={{ background: "var(--accent)" }}><ArrowLeftRight className="h-3.5 w-3.5" /> Déplacer</button>
        </div>
      </div>
    </Modal>
  );
}

// ── Capacité d'une zone ─────────────────────────────────────────
function CapaciteModal({ zone, used, onClose, onSave }: { zone: ChasseZone; used: number; onClose: () => void; onSave: (cap: number | null) => void }) {
  const [cap, setCap] = useState(zone.capacite == null ? "" : String(zone.capacite));
  return (
    <Modal titre={`⚙️ Capacité — ${zone.nom}`} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <p className="text-[0.82rem] text-muted">Stock actuel : <b className="font-num">{used}</b> u. Définis la capacité maximale pour activer la barre de remplissage et l&apos;alerte « presque pleine ».</p>
        <Champ label="Capacité maximale (u.)"><input className={inputCls} type="number" min={0} value={cap} onChange={(e) => setCap(e.target.value)} placeholder="Laisse vide pour aucune limite" autoFocus /></Champ>
        <div className="mt-1 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-border bg-surface-2 px-3.5 py-2 text-[0.82rem] font-semibold hover:border-border-2">Annuler</button>
          <button onClick={() => onSave(cap === "" ? null : Math.max(0, parseInt(cap, 10) || 0))} className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[0.82rem] font-semibold text-black/85" style={{ background: "var(--accent)" }}><Check className="h-3.5 w-3.5" /> Enregistrer</button>
        </div>
      </div>
    </Modal>
  );
}

// ── Import par photo (OCR) : lecture → aperçu corrigeable → appliquer ──
function PhotoModal({ zones, defaultZone, onClose, onApplied, setFlash }: {
  zones: ChasseZone[]; defaultZone: string; onClose: () => void;
  onApplied: (zoneId: string, lignes: LigneStock[], mode: "add" | "set") => void; setFlash: (f: FlashMsg) => void;
}) {
  const [zoneId, setZoneId] = useState(defaultZone);
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [lignes, setLignes] = useState<LigneStock[] | null>(null);
  const [mode, setMode] = useState<"add" | "set">("add");
  const [err, setErr] = useState<string | null>(null);

  async function lire() {
    setErr(null);
    if (!url) { setErr("Ajoute une photo, une capture, un scan ou un PDF."); return; }
    setBusy(true);
    const r = await lireStockChasse(url);
    setBusy(false);
    if (!r.ok || !r.lignes) { setErr(r.error || "Lecture impossible."); return; }
    setLignes(r.lignes);
  }
  function setLigne(i: number, patch: Partial<LigneStock>) { setLignes((prev) => (prev ? prev.map((l, k) => (k === i ? { ...l, ...patch } : l)) : prev)); }
  function retirer(i: number) { setLignes((prev) => (prev ? prev.filter((_, k) => k !== i) : prev)); }
  function ajouterLigne() { setLignes((prev) => [...(prev || []), { nom: "", quantite: 0 }]); }

  async function valider() {
    if (!lignes) return;
    const clean = lignes.filter((l) => l.nom.trim());
    if (!clean.length) { setErr("Aucune ligne à importer."); return; }
    setBusy(true);
    const r = await importerStockChasse({ zoneId, lignes: clean, mode });
    setBusy(false);
    if (!r.ok) { setErr(r.error || "Import impossible."); setFlash({ t: "bad", m: "Import OCR : " + (r.error || "erreur de reconnaissance.") }); return; }
    onApplied(zoneId, clean, mode);
    setFlash({ t: "ok", m: `Import OCR terminé — ${r.count} ressource(s) ${mode === "set" ? "corrigée(s)" : "ajoutée(s)"} à ${zoneNom(zones, zoneId)}.` });
    onClose();
  }

  return (
    <Modal titre="📸 Import par photo (OCR)" onClose={onClose} max={560}>
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1"><span className="text-[0.72rem] uppercase tracking-[0.05em] text-faint">Charrette de destination</span><Picker options={zones.map((z) => ({ key: z.id, label: z.nom }))} value={zoneId} onChange={setZoneId} /></div>

        {!lignes ? (
          <>
            <p className="text-[0.8rem] text-muted">Glisse une <b>photo</b>, une <b>capture</b>, un <b>scan</b> ou un <b>PDF</b> (PNG, JPEG, WebP, PDF) de l&apos;inventaire. L&apos;IA lit chaque ressource et sa quantité — tu pourras <b>corriger</b> avant de valider.</p>
            {!url ? <PhotoDrop dossier="chasse" onUploaded={(u) => setUrl(u)} label="Glisse une photo / capture / scan / PDF" />
              : (
                <div className="flex items-center gap-2 rounded-[10px] border border-border bg-surface-2 px-2.5 py-2 text-[0.8rem]">
                  {/^https?:\/\/.+\.(png|jpe?g|webp|gif)(\?|$)/i.test(url) ? <img src={url} alt="Aperçu" className="h-14 w-14 rounded-[8px] border border-border object-cover" /> : <span className="grid h-14 w-14 place-items-center rounded-[8px] border border-border text-[1.2rem]">📄</span>}
                  <span className="flex-1 truncate text-muted">Fichier prêt.</span>
                  <button onClick={() => setUrl(null)} className="text-faint hover:text-ink" aria-label="Retirer"><X className="h-4 w-4" /></button>
                </div>
              )}
            {err ? <p className="text-[0.8rem]" style={{ color: "var(--oxblood)" }}>{err}</p> : null}
            <div className="mt-1 flex justify-end gap-2">
              <button onClick={onClose} className="rounded-lg border border-border bg-surface-2 px-3.5 py-2 text-[0.82rem] font-semibold hover:border-border-2">Annuler</button>
              <button onClick={lire} disabled={busy || !url} className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[0.82rem] font-semibold text-black/85 disabled:opacity-50" style={{ background: "var(--accent)" }}>{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ScanLine className="h-3.5 w-3.5" />} Lire la photo</button>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[0.8rem] font-semibold">Aperçu — {lignes.length} ligne(s) détectée(s)</span>
              <Picker options={[{ key: "add", label: "➕ Ajouter au stock" }, { key: "set", label: "✏️ Remplacer le stock" }]} value={mode} onChange={(v) => setMode(v as "add" | "set")} />
            </div>
            <p className="text-[0.76rem] text-faint">Corrige les noms/quantités si besoin avant de valider. « Ajouter » cumule, « Remplacer » écrase la quantité de chaque ressource.</p>
            <div className="flex max-h-[46vh] flex-col gap-1.5 overflow-y-auto pr-1">
              {lignes.map((l, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-[1.05rem]">{emoji(l.nom)}</span>
                  <input className={inputCls} value={l.nom} onChange={(e) => setLigne(i, { nom: e.target.value })} placeholder="Ressource" maxLength={100} />
                  <input className={inputCls + " w-24"} type="number" min={0} value={l.quantite} onChange={(e) => setLigne(i, { quantite: Math.max(0, parseInt(e.target.value, 10) || 0) })} />
                  <button onClick={() => retirer(i)} className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-border text-faint hover:text-ink" aria-label="Retirer la ligne"><X className="h-4 w-4" /></button>
                </div>
              ))}
              <button onClick={ajouterLigne} className="mt-1 inline-flex items-center gap-1.5 self-start rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-[0.76rem] font-semibold hover:border-border-2"><Plus className="h-3.5 w-3.5" /> Ajouter une ligne</button>
            </div>
            {err ? <p className="text-[0.8rem]" style={{ color: "var(--oxblood)" }}>{err}</p> : null}
            <div className="mt-1 flex justify-end gap-2">
              <button onClick={() => { setLignes(null); setUrl(null); }} className="rounded-lg border border-border bg-surface-2 px-3.5 py-2 text-[0.82rem] font-semibold hover:border-border-2">Recommencer</button>
              <button onClick={valider} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[0.82rem] font-semibold text-black/85 disabled:opacity-50" style={{ background: "var(--accent)" }}>{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Valider l&apos;import</button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
