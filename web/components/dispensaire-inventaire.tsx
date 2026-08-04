"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Warehouse, Search, ArrowDownAZ, ArrowDownWideNarrow, Layers, X, AlertTriangle,
  ArrowDownRight, ArrowUpRight, History, Loader2, Building2, PackageX, Boxes, Info,
} from "lucide-react";
import { Cartouche, VideRegistre } from "@/components/dispensaire-ui";
import { catLabel, niveauStock, NIVEAU_TON, type Niveau, type StockData, type StockMouvement } from "@/lib/dispensaire-stock-const";
import { getMouvementsProduit } from "@/app/dispensaire/inventaire/actions";

const norm = (x: string) => x.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const dtFR = (iso: string) => { try { return new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "short", year: "numeric" }).format(new Date(iso)); } catch { return "—"; } };
const dhFR = (iso: string) => { try { return new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(iso)).replace(":", "h"); } catch { return "—"; } };
const catTone: Record<string, string> = { medicament: "var(--accent)", materiel: "var(--muted)", matiere: "var(--warn)", nourriture: "var(--good)", autre: "var(--faint)" };
const PASTILLE: Record<Niveau, string> = { rouge: "🔴", orange: "🟡", vert: "🟢" };
const NIVEAU_LABEL: Record<Niveau, string> = { rouge: "Critique", orange: "Faible", vert: "Suffisant" };

type PC = { coffre: string; stock: number; stockId: string; updatedAt: string | null; updatedBy: string | null };
type Produit = { nom: string; categorie: string; unite: string | null; total: number; seuil: number; cible: number; parCoffre: PC[]; ids: string[]; updatedAt: string | null; niveau: Niveau };

function pourcent(p: Produit): number {
  const ref = p.cible > 0 ? p.cible : p.seuil > 0 ? p.seuil * 2 : p.total || 1;
  return Math.max(0, Math.min(100, Math.round((p.total / ref) * 100)));
}

export function DispensaireInventaire({ data }: { data: StockData }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [tri, setTri] = useState<"alpha" | "qte" | "cat">("alpha");
  const [filtre, setFiltre] = useState<"" | "faible" | "critique">("");
  const [sel, setSel] = useState<Produit | null>(null);

  // Temps réel léger : rafraîchit la source toutes les 30 s (aucune action manuelle).
  useEffect(() => {
    const id = window.setInterval(() => router.refresh(), 30000);
    return () => window.clearInterval(id);
  }, [router]);

  // Agrégation : une ligne par produit (nom normalisé), tous coffres additionnés.
  const produits = useMemo<Produit[]>(() => {
    const m = new Map<string, Produit>();
    for (const it of data.items) {
      const k = norm(it.nom.trim());
      let e = m.get(k);
      if (!e) { e = { nom: it.nom, categorie: it.categorie, unite: it.unite, total: 0, seuil: 0, cible: 0, parCoffre: [], ids: [], updatedAt: null, niveau: "vert" }; m.set(k, e); }
      e.total += it.stock; e.seuil += it.seuil; e.cible += it.stockFixe;
      e.parCoffre.push({ coffre: (it.coffre || "").trim() || "Non rangé", stock: it.stock, stockId: it.id, updatedAt: it.updatedAt, updatedBy: it.updatedBy });
      e.ids.push(it.id);
      if (!e.unite && it.unite) e.unite = it.unite;
      if (it.updatedAt && (!e.updatedAt || it.updatedAt > e.updatedAt)) e.updatedAt = it.updatedAt;
    }
    const arr = [...m.values()];
    for (const p of arr) { p.niveau = niveauStock({ stock: p.total, seuil: p.seuil }); p.parCoffre.sort((a, b) => b.stock - a.stock); }
    return arr;
  }, [data.items]);

  const stats = useMemo(() => {
    const nbRef = produits.length;
    const qte = produits.reduce((a, p) => a + p.total, 0);
    const nbFaible = produits.filter((p) => p.total > 0 && p.seuil > 0 && p.total <= p.seuil).length;
    const nbRupture = produits.filter((p) => p.total <= 0).length;
    const maj = produits.reduce<string | null>((mx, p) => (p.updatedAt && (!mx || p.updatedAt > mx) ? p.updatedAt : mx), null);
    return { nbRef, qte, nbFaible, nbRupture, maj };
  }, [produits]);

  const query = norm(q.trim());
  const liste = useMemo(() => {
    let arr = produits.filter((p) => {
      if (query && !norm([p.nom, catLabel(p.categorie), p.unite, ...p.parCoffre.map((c) => c.coffre)].filter(Boolean).join(" ")).includes(query)) return false;
      if (filtre === "faible" && p.niveau !== "orange") return false;
      if (filtre === "critique" && p.niveau !== "rouge") return false;
      return true;
    });
    if (tri === "alpha") arr = [...arr].sort((a, b) => a.nom.localeCompare(b.nom));
    else if (tri === "qte") arr = [...arr].sort((a, b) => b.total - a.total);
    else arr = [...arr].sort((a, b) => catLabel(a.categorie).localeCompare(catLabel(b.categorie)) || a.nom.localeCompare(b.nom));
    return arr;
  }, [produits, query, filtre, tri]);

  return (
    <div className="flex flex-col gap-4">
      {!data.pret ? <div className="rounded-[12px] border px-3 py-2 text-[0.82rem]" style={{ borderColor: "color-mix(in srgb,var(--oxblood) 40%,var(--border))", color: "var(--oxblood)" }}>Lance <b>web/prisma/sql/dispensaire-stock.sql</b> dans Supabase, puis recharge.</div> : null}

      {/* Cartes de statistiques */}
      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-5">
        <Cartouche icon={Layers} label="Références" valeur={stats.nbRef} sous="produits distincts" />
        <Cartouche icon={Boxes} label="Quantité totale" valeur={stats.qte.toLocaleString("fr-FR")} ton="var(--accent)" sous="unités, tous coffres" />
        <Cartouche icon={AlertTriangle} label="Stock faible" valeur={stats.nbFaible} ton={stats.nbFaible ? "var(--warn)" : undefined} sous="sous le seuil" />
        <Cartouche icon={PackageX} label="En rupture" valeur={stats.nbRupture} ton={stats.nbRupture ? "var(--oxblood)" : undefined} sous="épuisés" />
        <Cartouche icon={History} label="Dernière mise à jour" valeur={<span className="text-[0.95rem]">{stats.maj ? dtFR(stats.maj) : "—"}</span>} sous="du stock" />
      </div>

      {/* Barre d'outils : recherche + tri + filtres */}
      <div className="flex flex-col gap-2 rounded-[12px] border border-border bg-surface p-2.5 sm:flex-row sm:items-center">
        <div className="flex flex-1 items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-2.5">
          <Search className="h-4 w-4 shrink-0 text-faint" />
          <input className="min-h-[36px] w-full bg-transparent text-[0.84rem] outline-none placeholder:text-faint" placeholder="Rechercher un produit…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="flex items-center gap-1">
          <TriBtn actif={tri === "alpha"} onClick={() => setTri("alpha")} icon={ArrowDownAZ} label="A-Z" />
          <TriBtn actif={tri === "qte"} onClick={() => setTri("qte")} icon={ArrowDownWideNarrow} label="Quantité" />
          <TriBtn actif={tri === "cat"} onClick={() => setTri("cat")} icon={Layers} label="Catégorie" />
        </div>
        <div className="flex items-center gap-1">
          <FiltreBtn actif={filtre === ""} onClick={() => setFiltre("")} label="Tous" tone="var(--muted)" />
          <FiltreBtn actif={filtre === "faible"} onClick={() => setFiltre((f) => (f === "faible" ? "" : "faible"))} label="🟡 Faible" tone="var(--warn)" />
          <FiltreBtn actif={filtre === "critique"} onClick={() => setFiltre((f) => (f === "critique" ? "" : "critique"))} label="🔴 Critique" tone="var(--oxblood)" />
        </div>
      </div>

      {/* Liste des produits */}
      {produits.length === 0 ? (
        <VideRegistre icon={Warehouse} titre="Aucun produit au registre" sous="Dès qu'un article est rangé dans un coffre, il apparaît ici avec son total consolidé." />
      ) : liste.length === 0 ? (
        <VideRegistre icon={Search} titre="Aucun produit ne correspond" sous="Ajuste la recherche ou les filtres." />
      ) : (
        <div className="flex flex-col gap-2">
          {liste.map((p) => {
            const pct = pourcent(p);
            const ton = NIVEAU_TON[p.niveau];
            return (
              <button key={p.nom + p.categorie} onClick={() => setSel(p)} className="iwc-rise group flex items-center gap-3 rounded-[12px] border border-border bg-surface px-3 py-2.5 text-left transition hover:border-border-2" style={{ borderLeft: `3px solid ${ton}` }}>
                <span className="text-[1.1rem] leading-none" aria-hidden>{PASTILLE[p.niveau]}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[0.9rem] font-semibold text-ink">{p.nom}</span>
                    <span className="shrink-0 rounded px-1.5 py-0.5 text-[0.58rem] font-bold uppercase tracking-[0.05em]" style={{ color: catTone[p.categorie] || "var(--faint)", background: `color-mix(in srgb,${catTone[p.categorie] || "var(--faint)"} 14%,transparent)` }}>{catLabel(p.categorie)}</span>
                    {p.parCoffre.length > 1 ? <span className="shrink-0 text-[0.64rem] text-faint">· {p.parCoffre.length} coffres</span> : null}
                  </div>
                  <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
                    <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: ton }} />
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="font-num text-[1.05rem] font-bold leading-none" style={{ color: ton }}>{p.total.toLocaleString("fr-FR")}<span className="ml-1 text-[0.66rem] font-normal text-faint">{p.unite || ""}</span></div>
                  <div className="mt-0.5 text-[0.62rem] text-faint">{p.seuil > 0 ? `seuil ${p.seuil}` : "—"} · {NIVEAU_LABEL[p.niveau]}</div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {sel ? <FicheProduit produit={sel} onClose={() => setSel(null)} /> : null}
    </div>
  );
}

function TriBtn({ actif, onClick, icon: Icon, label }: { actif: boolean; onClick: () => void; icon: typeof Layers; label: string }) {
  return (
    <button onClick={onClick} className="inline-flex items-center gap-1 rounded-lg border px-2 py-1.5 text-[0.72rem] font-semibold transition" style={actif ? { borderColor: "color-mix(in srgb,var(--accent) 45%,var(--border))", background: "color-mix(in srgb,var(--accent) 12%,transparent)", color: "var(--ink)" } : { borderColor: "var(--border)", color: "var(--muted)" }}>
      <Icon className="h-3.5 w-3.5" /> <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
function FiltreBtn({ actif, onClick, label, tone }: { actif: boolean; onClick: () => void; label: string; tone: string }) {
  return (
    <button onClick={onClick} className="rounded-lg border px-2 py-1.5 text-[0.72rem] font-semibold transition" style={actif ? { borderColor: tone, background: `color-mix(in srgb,${tone} 15%,transparent)`, color: "var(--ink)" } : { borderColor: "var(--border)", color: "var(--muted)" }}>{label}</button>
  );
}

// ── Fiche produit (lecture seule) ─────────────────────────────────────────────
function FicheProduit({ produit, onClose }: { produit: Produit; onClose: () => void }) {
  const [mvts, setMvts] = useState<StockMouvement[] | null>(null);
  useEffect(() => {
    let alive = true;
    setMvts(null);
    getMouvementsProduit(produit.ids).then((m) => { if (alive) setMvts(m); }).catch(() => { if (alive) setMvts([]); });
    return () => { alive = false; };
  }, [produit]);

  const ton = NIVEAU_TON[produit.niveau];
  const entrees = (mvts || []).filter((m) => m.delta >= 0);
  const sorties = (mvts || []).filter((m) => m.delta < 0);

  return (
    <div className="fixed inset-0 z-50 grid place-items-start overflow-auto bg-black/55 p-4 sm:p-8" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="iwc-pop mx-auto w-full max-w-[560px] rounded-[14px] border border-border-2 bg-surface shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {/* En-tête */}
        <div className="flex items-start gap-3 border-b border-border px-4 py-3">
          <span className="text-[1.3rem] leading-none" aria-hidden>{PASTILLE[produit.niveau]}</span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="truncate font-display text-[1.15rem] text-ink">{produit.nom}</h2>
              <span className="shrink-0 rounded px-1.5 py-0.5 text-[0.58rem] font-bold uppercase tracking-[0.05em]" style={{ color: catTone[produit.categorie] || "var(--faint)", background: `color-mix(in srgb,${catTone[produit.categorie] || "var(--faint)"} 14%,transparent)` }}>{catLabel(produit.categorie)}</span>
            </div>
            <div className="mt-0.5 text-[0.72rem] text-faint">{NIVEAU_LABEL[produit.niveau]} · seuil {produit.seuil || "—"}</div>
          </div>
          <button onClick={onClose} className="shrink-0 rounded-md p-1 text-faint hover:text-ink"><X className="h-4 w-4" /></button>
        </div>

        <div className="max-h-[70vh] overflow-auto px-4 py-3">
          {/* Total */}
          <div className="mb-3 flex items-end justify-between rounded-[12px] border border-border bg-surface-2 px-3.5 py-2.5">
            <span className="text-[0.72rem] uppercase tracking-[0.05em] text-faint">Quantité totale</span>
            <span className="font-num text-[1.7rem] font-bold leading-none" style={{ color: ton }}>{produit.total.toLocaleString("fr-FR")}<span className="ml-1.5 text-[0.8rem] font-normal text-faint">{produit.unite || ""}</span></span>
          </div>

          {/* Répartition par coffre */}
          <div className="mb-3">
            <div className="mb-1.5 flex items-center gap-1.5 text-[0.7rem] font-semibold uppercase tracking-[0.05em] text-faint"><Building2 className="h-3.5 w-3.5" /> Répartition par coffre</div>
            <div className="flex flex-col gap-1">
              {produit.parCoffre.map((c) => (
                <div key={c.stockId} className="flex items-center gap-2 rounded-[8px] border border-border bg-surface-2 px-2.5 py-1.5 text-[0.8rem]">
                  <span className="flex-1 truncate">{c.coffre}</span>
                  {c.updatedBy ? <span className="hidden text-[0.64rem] text-faint sm:inline">maj {c.updatedBy}</span> : null}
                  <span className="font-num font-semibold">{c.stock.toLocaleString("fr-FR")} {produit.unite || ""}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Mouvements */}
          <div className="mb-2 flex items-center gap-1.5 text-[0.7rem] font-semibold uppercase tracking-[0.05em] text-faint"><History className="h-3.5 w-3.5" /> Historique des mouvements {mvts ? `(${mvts.length})` : ""}</div>
          {mvts === null ? (
            <div className="flex items-center gap-2 px-1 py-3 text-[0.8rem] text-faint"><Loader2 className="h-4 w-4 animate-spin" /> Chargement…</div>
          ) : mvts.length === 0 ? (
            <div className="px-1 py-3 text-[0.8rem] text-faint">Aucun mouvement enregistré.</div>
          ) : (
            <>
              <div className="mb-2 flex gap-2 text-[0.7rem]">
                <span className="rounded px-1.5 py-0.5" style={{ color: "var(--good)", background: "color-mix(in srgb,var(--good) 12%,transparent)" }}>↘ {entrees.length} entrée(s)</span>
                <span className="rounded px-1.5 py-0.5" style={{ color: "var(--oxblood)", background: "color-mix(in srgb,var(--oxblood) 12%,transparent)" }}>↗ {sorties.length} sortie(s)</span>
              </div>
              <ul className="flex flex-col gap-1">
                {mvts.map((m) => {
                  const entree = m.delta >= 0;
                  const c = entree ? "var(--good)" : "var(--oxblood)";
                  return (
                    <li key={m.id} className="flex items-center gap-2 rounded-[8px] border border-border bg-surface-2 px-2.5 py-1.5 text-[0.78rem]">
                      {entree ? <ArrowDownRight className="h-3.5 w-3.5 shrink-0" style={{ color: c }} /> : <ArrowUpRight className="h-3.5 w-3.5 shrink-0" style={{ color: c }} />}
                      <span className="font-num font-semibold" style={{ color: c }}>{m.delta > 0 ? "+" : ""}{m.delta}</span>
                      <div className="min-w-0 flex-1">
                        <span className="text-muted">{m.coffre || "—"}</span>
                        {m.motif ? <span className="text-faint"> · {m.motif}</span> : null}
                      </div>
                      <span className="shrink-0 text-[0.66rem] text-faint">{m.par || "—"} · {dhFR(m.createdAt)}</span>
                    </li>
                  );
                })}
              </ul>
            </>
          )}

          <p className="mt-3 flex items-center gap-1.5 text-[0.68rem] italic text-faint"><Info className="h-3.5 w-3.5" /> Fenêtre uniquement informative — les modifications se font dans « Stockage » et « Stock Matériel Médical ».</p>
        </div>
      </div>
    </div>
  );
}
