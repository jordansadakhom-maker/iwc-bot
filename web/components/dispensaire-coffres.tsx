"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, Plus, Check, Pencil, Trash2, MapPin, UserRound, Search, Boxes, AlertTriangle, BadgePlus, ArrowDownAZ, ArrowDownWideNarrow, PackageOpen } from "lucide-react";
import { CATEGORIES, catLabel, enAlerte, niveauStock, NIVEAU_TON, type StockItem, type CoffresInvData } from "@/lib/dispensaire-stock-const";
import { Modal, Flash, Champ, Picker, PhotoField, inputCls } from "@/components/edit-ui";
import { VideRegistre } from "@/components/dispensaire-ui";
import { creerCoffre, majCoffre, supprimerCoffre } from "@/app/dispensaire/coffres/actions";
import { creerItem, majItem, supprimerItem, ajusterStock, deplacerItem } from "@/app/dispensaire/stockage/actions";

type FlashMsg = { t: "ok" | "bad"; m: string } | null;
type CoffreMeta = { id: string; nom: string; emplacement: string | null; responsable: string | null; note: string | null; photo: string | null };
type Modale =
  | { type: "newCoffre" }
  | { type: "editCoffre"; meta: CoffreMeta }
  | { type: "delCoffre"; meta: CoffreMeta }
  | { type: "newItem"; coffre: string }
  | { type: "editItem"; item: StockItem }
  | { type: "delItem"; item: StockItem }
  | null;

const norm = (x: string) => x.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const rid = () => "tmp-" + Math.random().toString(36).slice(2, 8);
const catTone: Record<string, string> = { medicament: "var(--accent)", materiel: "var(--muted)", matiere: "var(--warn)", nourriture: "var(--good)", autre: "var(--faint)" };

export function DispensaireCoffres({ data }: { data: CoffresInvData }) {
  const router = useRouter();
  const [items, setItems] = useState<StockItem[]>(() => data.coffres.flatMap((c) => c.items));
  const [metas, setMetas] = useState<CoffreMeta[]>(() => data.coffres.filter((c) => c.id).map((c) => ({ id: c.id as string, nom: c.nom, emplacement: c.emplacement, responsable: c.responsable, note: c.note, photo: c.photo })));
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [tri, setTri] = useState<"alpha" | "qte">("alpha");
  const [flash, setFlash] = useState<FlashMsg>(null);
  const [modale, setModale] = useState<Modale>(null);

  const query = norm(q.trim());
  const filtreActif = !!(cat || query);
  const match = (it: StockItem) => (!cat || it.categorie === cat) && (!query || norm([it.nom, it.note, catLabel(it.categorie)].filter(Boolean).join(" ")).includes(query));

  // Recompose les coffres (déclarés → dérivés → Non rangé), en appliquant filtre & tri.
  const coffres = useMemo(() => {
    const parCoffre = new Map<string, StockItem[]>();
    for (const it of items) { const k = (it.coffre || "").trim(); (parCoffre.get(k) || parCoffre.set(k, []).get(k))!.push(it); }
    const nomsMeta = new Set(metas.map((m) => m.nom));
    const build = (nom: string, meta?: CoffreMeta) => {
      let its = (parCoffre.get(nom) || []).filter(match);
      its = [...its].sort((a, b) => (tri === "qte" ? b.stock - a.stock : a.nom.localeCompare(b.nom)));
      return { id: meta?.id ?? null, nom, emplacement: meta?.emplacement ?? null, responsable: meta?.responsable ?? null, note: meta?.note ?? null, photo: meta?.photo ?? null, items: its, nbObjets: its.length, totalUnites: its.reduce((a, b) => a + b.stock, 0), alertes: its.filter(enAlerte).length };
    };
    const out: ReturnType<typeof build>[] = [];
    for (const m of [...metas].sort((a, b) => a.nom.localeCompare(b.nom))) out.push(build(m.nom, m));
    for (const nom of [...parCoffre.keys()].filter((k) => k && !nomsMeta.has(k)).sort((a, b) => a.localeCompare(b))) out.push(build(nom));
    if ((parCoffre.get("") || []).length) out.push(build(""));
    return filtreActif ? out.filter((c) => c.items.length > 0) : out;
  }, [items, metas, cat, query, tri, filtreActif]);

  const nomsCoffres = useMemo(() => [...new Set([...metas.map((m) => m.nom), ...items.map((i) => (i.coffre || "").trim()).filter(Boolean)])].sort((a, b) => a.localeCompare(b)), [metas, items]);
  const totalAlertes = useMemo(() => items.filter(enAlerte).length, [items]);

  // ── Coffres ──
  async function enregistrerCoffre(vals: Record<string, string>, editing: CoffreMeta | null) {
    setModale(null);
    if (editing) {
      const ancien = editing.nom;
      setMetas((p) => p.map((m) => (m.id === editing.id ? { ...m, ...vals } as CoffreMeta : m)));
      if (vals.nom && vals.nom !== ancien) setItems((p) => p.map((it) => ((it.coffre || "").trim() === ancien ? { ...it, coffre: vals.nom } : it)));
      const r = await majCoffre(editing.id, vals);
      if (!r.ok) setFlash({ t: "bad", m: r.error || "Impossible." }); else router.refresh();
    } else {
      const tmp: CoffreMeta = { id: rid(), nom: vals.nom, emplacement: vals.emplacement || null, responsable: vals.responsable || null, note: vals.note || null, photo: vals.photo || null };
      setMetas((p) => [...p, tmp]);
      const r = await creerCoffre(vals);
      if (!r.ok) { setMetas((p) => p.filter((m) => m.id !== tmp.id)); setFlash({ t: "bad", m: r.error || "Impossible." }); }
      else { setMetas((p) => p.map((m) => (m.id === tmp.id ? { ...m, id: r.id || tmp.id } : m))); setFlash({ t: "ok", m: "Coffre ajouté." }); router.refresh(); }
    }
  }
  async function supprimerLeCoffre(meta: CoffreMeta) {
    setModale(null);
    setMetas((p) => p.filter((m) => m.id !== meta.id));
    setItems((p) => p.map((it) => ((it.coffre || "").trim() === meta.nom ? { ...it, coffre: null } : it)));
    const r = await supprimerCoffre(meta.id);
    if (!r.ok) setFlash({ t: "bad", m: r.error || "Impossible." }); else { setFlash({ t: "ok", m: "Coffre supprimé — ses objets sont passés en « Non rangé »." }); router.refresh(); }
  }
  async function declarer(nom: string) {
    const tmp: CoffreMeta = { id: rid(), nom, emplacement: null, responsable: null, note: null, photo: null };
    setMetas((p) => [...p, tmp]);
    const r = await creerCoffre({ nom });
    if (!r.ok) { setMetas((p) => p.filter((m) => m.id !== tmp.id)); setFlash({ t: "bad", m: r.error || "Impossible." }); }
    else { setMetas((p) => p.map((m) => (m.id === tmp.id ? { ...m, id: r.id || tmp.id } : m))); setFlash({ t: "ok", m: "Coffre déclaré." }); router.refresh(); }
  }

  // ── Objets ──
  async function enregistrerItem(vals: Record<string, string>, editing: StockItem | null) {
    setModale(null);
    const clean = { ...vals, stock: Number(vals.stock) || 0, stockFixe: Number(vals.stockFixe) || 0, seuil: Number(vals.seuil) || 0 };
    if (editing) {
      setItems((p) => p.map((it) => (it.id === editing.id ? { ...it, ...clean } as StockItem : it)));
      const r = await majItem(editing.id, clean);
      if (!r.ok) setFlash({ t: "bad", m: r.error || "Impossible." }); else router.refresh();
    } else {
      const tmp: StockItem = { id: rid(), nom: vals.nom, categorie: vals.categorie || "materiel", coffre: vals.coffre || null, unite: vals.unite || null, stock: clean.stock, stockFixe: clean.stockFixe, seuil: clean.seuil, note: vals.note || null, photo: vals.photo || null, updatedAt: null, updatedBy: null };
      setItems((p) => [...p, tmp]);
      const r = await creerItem(clean);
      if (!r.ok) { setItems((p) => p.filter((it) => it.id !== tmp.id)); setFlash({ t: "bad", m: r.error || "Impossible." }); }
      else { setItems((p) => p.map((it) => (it.id === tmp.id ? { ...it, id: r.id || tmp.id } : it))); setFlash({ t: "ok", m: "Objet ajouté." }); router.refresh(); }
    }
  }
  async function supprimerItem_(item: StockItem) {
    setModale(null);
    setItems((p) => p.filter((it) => it.id !== item.id));
    const r = await supprimerItem(item.id);
    if (!r.ok) setFlash({ t: "bad", m: r.error || "Impossible." }); else router.refresh();
  }
  async function ajuster(it: StockItem, delta: number) {
    const apres = Math.max(0, it.stock + delta);
    if (apres === it.stock) return;
    setItems((p) => p.map((x) => (x.id === it.id ? { ...x, stock: apres } : x)));
    const r = await ajusterStock(it.id, apres - it.stock);
    if (!r.ok) { setItems((p) => p.map((x) => (x.id === it.id ? { ...x, stock: it.stock } : x))); setFlash({ t: "bad", m: r.error || "Impossible." }); } else router.refresh();
  }
  async function deplacer(it: StockItem, dest: string) {
    const destC = dest || null;
    if ((it.coffre || "") === (destC || "")) return;
    setItems((p) => p.map((x) => (x.id === it.id ? { ...x, coffre: destC } : x)));
    const r = await deplacerItem(it.id, dest);
    if (!r.ok) { setItems((p) => p.map((x) => (x.id === it.id ? { ...x, coffre: it.coffre } : x))); setFlash({ t: "bad", m: r.error || "Impossible." }); }
    else { setFlash({ t: "ok", m: `Objet déplacé vers ${destC || "Non rangé"}.` }); router.refresh(); }
  }

  const rien = coffres.length === 0 && !filtreActif;

  return (
    <div className="flex flex-col gap-4">
      {!data.pret ? <Flash tone="bad">Lance <b>web/prisma/sql/dispensaire-matieres.sql</b> et <b>dispensaire-stock.sql</b> dans Supabase, puis recharge.</Flash> : null}
      {flash ? <Flash tone={flash.t === "ok" ? "good" : "bad"}>{flash.m}</Flash> : null}

      {/* Barre d'action */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-2.5">
          <h3 className="flex items-center gap-2 text-[0.95rem] font-semibold"><Archive className="h-4 w-4 text-accent" /> Coffres</h3>
          <span className="font-num text-[0.8rem] text-faint">{coffres.filter((c) => c.nom).length || metas.length}</span>
          {totalAlertes ? <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.68rem] font-bold text-white" style={{ background: "var(--oxblood)" }}><AlertTriangle className="h-3 w-3" /> {totalAlertes} en alerte</span> : null}
        </div>
        <button onClick={() => setModale({ type: "newCoffre" })} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[0.76rem] font-semibold text-black/85" style={{ background: "var(--accent)" }}><Plus className="h-3.5 w-3.5" /> Ajouter un coffre</button>
      </div>
      <p className="text-[0.76rem] text-faint">Chaque coffre est un <b>inventaire réel</b> : ajoute des objets, ajuste les quantités d&apos;un clic, déplace un objet d&apos;un coffre à l&apos;autre. La pastille indique l&apos;état du stock — 🟢 confortable, 🟠 proche du seuil, 🔴 sous le seuil.</p>

      {/* Filtres */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[180px] flex-1"><Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" /><input className={inputCls + " pl-8"} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un objet…" /></div>
        <select className={inputCls + " max-w-[170px]"} value={cat} onChange={(e) => setCat(e.target.value)}><option value="">Toutes catégories</option>{CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}</select>
        <button onClick={() => setTri((t) => (t === "alpha" ? "qte" : "alpha"))} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-2.5 py-2 text-[0.74rem] font-semibold text-muted hover:text-ink" title="Changer le tri">
          {tri === "alpha" ? <><ArrowDownAZ className="h-3.5 w-3.5" /> A→Z</> : <><ArrowDownWideNarrow className="h-3.5 w-3.5" /> Quantité</>}
        </button>
      </div>

      {rien ? (
        <VideRegistre icon={Archive} titre="Aucun coffre n'est encore déclaré" sous="Ajoute un premier coffre — nom, emplacement, responsable — puis range-y des objets. Chaque coffre tiendra son propre inventaire." />
      ) : coffres.length === 0 ? (
        <p className="px-1 py-10 text-center text-[0.85rem] italic text-faint">Aucun objet ne correspond à ta recherche.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {coffres.map((c) => (
            <CoffreBloc
              key={c.id || c.nom || "non-range"}
              coffre={c}
              nomsCoffres={nomsCoffres}
              onAddObjet={() => setModale({ type: "newItem", coffre: c.nom })}
              onEditCoffre={c.id ? () => setModale({ type: "editCoffre", meta: { id: c.id as string, nom: c.nom, emplacement: c.emplacement, responsable: c.responsable, note: c.note, photo: c.photo } }) : undefined}
              onDelCoffre={c.id ? () => setModale({ type: "delCoffre", meta: { id: c.id as string, nom: c.nom, emplacement: c.emplacement, responsable: c.responsable, note: c.note, photo: c.photo } }) : undefined}
              onDeclarer={!c.id && c.nom ? () => declarer(c.nom) : undefined}
              onEditItem={(it) => setModale({ type: "editItem", item: it })}
              onDelItem={(it) => setModale({ type: "delItem", item: it })}
              onAjuster={ajuster}
              onDeplacer={deplacer}
            />
          ))}
        </div>
      )}

      {modale?.type === "newCoffre" ? <CoffreForm initial={null} onClose={() => setModale(null)} onSave={(v) => enregistrerCoffre(v, null)} /> : null}
      {modale?.type === "editCoffre" ? <CoffreForm initial={modale.meta} onClose={() => setModale(null)} onSave={(v) => enregistrerCoffre(v, modale.meta)} /> : null}
      {modale?.type === "delCoffre" ? <ConfirmCoffre nom={modale.meta.nom} onCancel={() => setModale(null)} onConfirm={() => supprimerLeCoffre(modale.meta)} /> : null}
      {modale?.type === "newItem" ? <ItemForm initial={null} defaultCoffre={modale.coffre} coffres={nomsCoffres} onClose={() => setModale(null)} onSave={(v) => enregistrerItem(v, null)} /> : null}
      {modale?.type === "editItem" ? <ItemForm initial={modale.item} defaultCoffre={modale.item.coffre || ""} coffres={nomsCoffres} onClose={() => setModale(null)} onSave={(v) => enregistrerItem(v, modale.item)} /> : null}
      {modale?.type === "delItem" ? <ConfirmItem nom={modale.item.nom} onCancel={() => setModale(null)} onConfirm={() => supprimerItem_(modale.item)} /> : null}
    </div>
  );
}

type CoffreVue = { id: string | null; nom: string; emplacement: string | null; responsable: string | null; note: string | null; photo: string | null; items: StockItem[]; nbObjets: number; totalUnites: number; alertes: number };

function CoffreBloc({ coffre: c, nomsCoffres, onAddObjet, onEditCoffre, onDelCoffre, onDeclarer, onEditItem, onDelItem, onAjuster, onDeplacer }: {
  coffre: CoffreVue; nomsCoffres: string[];
  onAddObjet: () => void; onEditCoffre?: () => void; onDelCoffre?: () => void; onDeclarer?: () => void;
  onEditItem: (it: StockItem) => void; onDelItem: (it: StockItem) => void; onAjuster: (it: StockItem, d: number) => void; onDeplacer: (it: StockItem, dest: string) => void;
}) {
  const nonRange = c.nom === "";
  return (
    <section className="rounded-[14px] border border-border bg-surface p-3.5" style={c.alertes ? { borderColor: "color-mix(in srgb,var(--oxblood) 35%,var(--border))" } : undefined}>
      {/* Entête du coffre */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          {c.photo ? (
            <a href={c.photo} target="_blank" rel="noreferrer" className="shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={c.photo} alt={c.nom} className="h-9 w-9 rounded-lg border border-border object-cover transition hover:brightness-110" />
            </a>
          ) : (
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg" style={{ background: nonRange ? "color-mix(in srgb,var(--muted) 14%,transparent)" : "color-mix(in srgb,var(--accent) 12%,transparent)" }}>{nonRange ? <PackageOpen className="h-4 w-4 text-muted" /> : <Archive className="h-4 w-4 text-accent" />}</span>
          )}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="truncate text-[0.92rem] font-semibold">{nonRange ? "Non rangé" : c.nom}</span>
              {!c.id && !nonRange ? <span className="rounded-full border border-border px-1.5 py-0.5 text-[0.58rem] uppercase text-faint">non déclaré</span> : null}
              {c.alertes ? <span className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[0.58rem] font-bold text-white" style={{ background: "var(--oxblood)" }}><AlertTriangle className="h-2.5 w-2.5" /> {c.alertes}</span> : null}
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[0.7rem] text-faint">
              <span className="font-num"><b className="text-muted">{c.nbObjets}</b> objet{c.nbObjets > 1 ? "s" : ""} · <b className="text-muted">{c.totalUnites}</b> unité{c.totalUnites > 1 ? "s" : ""}</span>
              {c.emplacement ? <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" /> {c.emplacement}</span> : null}
              {c.responsable ? <span className="inline-flex items-center gap-1"><UserRound className="h-3 w-3" /> {c.responsable}</span> : null}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {!nonRange ? <button onClick={onAddObjet} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[0.7rem] font-semibold text-muted hover:text-ink"><Plus className="h-3.5 w-3.5" /> Objet</button> : null}
          {onDeclarer ? <button onClick={onDeclarer} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[0.7rem] font-semibold text-accent hover:brightness-110" title="Déclarer ce coffre (emplacement, responsable, photo)"><BadgePlus className="h-3.5 w-3.5" /> Déclarer</button> : null}
          {onEditCoffre ? <button onClick={onEditCoffre} className="grid h-7 w-7 place-items-center rounded-md border border-border text-faint hover:text-ink" aria-label="Modifier le coffre"><Pencil className="h-3.5 w-3.5" /></button> : null}
          {onDelCoffre ? <button onClick={onDelCoffre} className="grid h-7 w-7 place-items-center rounded-md border border-border text-faint hover:text-oxblood" aria-label="Supprimer le coffre"><Trash2 className="h-3.5 w-3.5" /></button> : null}
        </div>
      </div>
      {c.note ? <div className="mt-1.5 text-[0.72rem] text-muted">{c.note}</div> : null}

      {/* Objets du coffre */}
      {c.items.length === 0 ? (
        <p className="mt-2.5 rounded-lg border border-dashed border-border py-4 text-center text-[0.76rem] italic text-faint">Coffre vide — {nonRange ? "déplace un objet ici ou range-le depuis un autre coffre." : "ajoute un premier objet."}</p>
      ) : (
        <div className="mt-2.5 flex flex-col divide-y divide-border/70">
          {c.items.map((it) => <ObjetLigne key={it.id} it={it} nomsCoffres={nomsCoffres} onEdit={() => onEditItem(it)} onDel={() => onDelItem(it)} onAjuster={onAjuster} onDeplacer={onDeplacer} />)}
        </div>
      )}
    </section>
  );
}

function ObjetLigne({ it, nomsCoffres, onEdit, onDel, onAjuster, onDeplacer }: { it: StockItem; nomsCoffres: string[]; onEdit: () => void; onDel: () => void; onAjuster: (it: StockItem, d: number) => void; onDeplacer: (it: StockItem, dest: string) => void }) {
  const [pas, setPas] = useState("1");
  const niveau = niveauStock(it);
  const p = Math.max(1, Math.round(Number(pas) || 1));
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2">
      {/* Identité */}
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span className="grid h-6 w-6 shrink-0 place-items-center" title={niveau === "vert" ? "Stock confortable" : niveau === "orange" ? "Proche du seuil" : "Sous le seuil"}><span className="h-2.5 w-2.5 rounded-full" style={{ background: NIVEAU_TON[niveau], boxShadow: `0 0 0 3px color-mix(in srgb,${NIVEAU_TON[niveau]} 18%,transparent)` }} /></span>
        {it.photo ? (
          <a href={it.photo} target="_blank" rel="noreferrer" className="shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={it.photo} alt={it.nom} className="h-8 w-8 rounded-md border border-border object-cover" />
          </a>
        ) : null}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[0.86rem] font-semibold">{it.nom}</span>
            <span className="rounded-full px-1.5 py-0.5 text-[0.58rem] font-bold uppercase" style={{ color: catTone[it.categorie] || "var(--muted)", background: `color-mix(in srgb,${catTone[it.categorie] || "var(--muted)"} 14%,transparent)` }}>{catLabel(it.categorie)}</span>
          </div>
          <div className="text-[0.68rem] text-faint">Seuil {it.seuil}{it.stockFixe ? ` · fixe ${it.stockFixe}` : ""}{it.note ? ` · ${it.note}` : ""}</div>
        </div>
      </div>
      {/* Quantité */}
      <div className="flex items-center gap-1.5">
        <button onClick={() => onAjuster(it, -p)} className="grid h-7 w-7 place-items-center rounded-md border border-border font-bold text-oxblood hover:bg-surface-2" aria-label="Retirer">−</button>
        <div className="min-w-[3rem] text-center"><span className="font-num text-[1.15rem] font-bold leading-none" style={{ color: niveau === "rouge" ? "var(--oxblood)" : "var(--ink)" }}>{it.stock}</span><span className="block text-[0.58rem] text-faint">{it.unite || "u"}</span></div>
        <button onClick={() => onAjuster(it, p)} className="grid h-7 w-7 place-items-center rounded-md border border-border font-bold text-good hover:bg-surface-2" aria-label="Ajouter">+</button>
        <input className={inputCls + " w-12 text-center !py-1"} value={pas} onChange={(e) => setPas(e.target.value.replace(/[^0-9]/g, ""))} inputMode="numeric" aria-label="Pas" title="Pas d'ajustement" />
      </div>
      {/* Déplacer + actions */}
      <div className="flex items-center gap-1.5">
        <select value={(it.coffre || "").trim()} onChange={(e) => onDeplacer(it, e.target.value)} className="max-w-[130px] rounded-md border border-border bg-surface px-2 py-1 text-[0.72rem] text-muted" title="Déplacer vers un autre coffre" aria-label="Déplacer">
          <option value="">Non rangé</option>
          {nomsCoffres.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        <button onClick={onEdit} className="grid h-7 w-7 place-items-center rounded-md border border-border text-faint hover:text-ink" aria-label="Modifier l'objet"><Pencil className="h-3.5 w-3.5" /></button>
        <button onClick={onDel} className="grid h-7 w-7 place-items-center rounded-md border border-border text-faint hover:text-oxblood" aria-label="Supprimer l'objet"><Trash2 className="h-3.5 w-3.5" /></button>
      </div>
    </div>
  );
}

function CoffreForm({ initial, onClose, onSave }: { initial: CoffreMeta | null; onClose: () => void; onSave: (v: Record<string, string>) => void }) {
  const [v, setV] = useState<Record<string, string>>(() => ({ nom: initial?.nom || "", emplacement: initial?.emplacement || "", responsable: initial?.responsable || "", note: initial?.note || "", photo: initial?.photo || "" }));
  const [err, setErr] = useState<string | null>(null);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV((p) => ({ ...p, [k]: e.target.value }));
  function go() { if (v.nom.trim().length < 1) { setErr("Le nom est obligatoire."); return; } onSave(v); }
  return (
    <Modal titre={initial ? "✏️ Modifier le coffre" : "➕ Ajouter un coffre"} onClose={onClose} max={480}>
      <div className="flex flex-col gap-3">
        <Champ label="Nom *"><input className={inputCls} value={v.nom} onChange={set("nom")} placeholder="Coffre principal, pharmacie…" autoFocus /></Champ>
        <div className="grid gap-3 sm:grid-cols-2">
          <Champ label="Emplacement"><input className={inputCls} value={v.emplacement} onChange={set("emplacement")} placeholder="Réserve, bureau…" /></Champ>
          <Champ label="Responsable"><input className={inputCls} value={v.responsable} onChange={set("responsable")} placeholder="Nom" /></Champ>
        </div>
        <Champ label="Note"><textarea className={inputCls} rows={2} value={v.note} onChange={set("note")} /></Champ>
        <div className="flex flex-col gap-1"><span className="text-[0.72rem] uppercase tracking-[0.05em] text-faint">Photo du coffre (facultatif)</span><PhotoField dossier="dispensaire-coffres" value={v.photo} onChange={(url) => setV((p) => ({ ...p, photo: url }))} label="Photo du coffre ou de son contenu" /></div>
        {err ? <p className="text-[0.8rem]" style={{ color: "var(--oxblood)" }}>{err}</p> : null}
        <div className="mt-1 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-border bg-surface-2 px-3.5 py-2 text-[0.82rem] font-semibold hover:border-border-2">Annuler</button>
          <button onClick={go} className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[0.82rem] font-semibold text-black/85" style={{ background: "var(--accent)" }}><Check className="h-3.5 w-3.5" /> Enregistrer</button>
        </div>
      </div>
    </Modal>
  );
}

function ItemForm({ initial, defaultCoffre, coffres, onClose, onSave }: { initial: StockItem | null; defaultCoffre: string; coffres: string[]; onClose: () => void; onSave: (v: Record<string, string>) => void }) {
  const [v, setV] = useState<Record<string, string>>(() => ({
    nom: initial?.nom || "", categorie: initial?.categorie || "materiel", coffre: initial?.coffre ?? defaultCoffre ?? "", unite: initial?.unite || "",
    stock: String(initial?.stock ?? 0), stockFixe: String(initial?.stockFixe ?? 0), seuil: String(initial?.seuil ?? 0), note: initial?.note || "", photo: initial?.photo || "",
  }));
  const [err, setErr] = useState<string | null>(null);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV((p) => ({ ...p, [k]: e.target.value }));
  const setNum = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setV((p) => ({ ...p, [k]: e.target.value.replace(/[^0-9]/g, "") }));
  function go() { if (v.nom.trim().length < 1) { setErr("Le nom est obligatoire."); return; } onSave(v); }
  return (
    <Modal titre={initial ? "✏️ Modifier l'objet" : "➕ Ajouter un objet"} onClose={onClose} max={560}>
      <div className="flex flex-col gap-3">
        <Champ label="Nom *"><input className={inputCls} value={v.nom} onChange={set("nom")} placeholder="Bandages, morphine, bois…" autoFocus /></Champ>
        <div className="flex flex-col gap-1"><span className="text-[0.72rem] uppercase tracking-[0.05em] text-faint">Catégorie</span><Picker options={CATEGORIES.map((c) => ({ key: c.key, label: c.label, tone: catTone[c.key] }))} value={v.categorie} onChange={(x) => setV((p) => ({ ...p, categorie: x }))} /></div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Champ label="Coffre"><input className={inputCls} value={v.coffre} onChange={set("coffre")} placeholder="Coffre principal… (vide = Non rangé)" list="disp-coffres-inv" /><datalist id="disp-coffres-inv">{coffres.map((c) => <option key={c} value={c} />)}</datalist></Champ>
          <Champ label="Unité"><input className={inputCls} value={v.unite} onChange={set("unite")} placeholder="u, flacon, kg…" /></Champ>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Champ label="Stock actuel"><input className={inputCls} value={v.stock} onChange={setNum("stock")} inputMode="numeric" /></Champ>
          <Champ label="Stock fixe (cible)"><input className={inputCls} value={v.stockFixe} onChange={setNum("stockFixe")} inputMode="numeric" /></Champ>
          <Champ label="Seuil d'alerte"><input className={inputCls} value={v.seuil} onChange={setNum("seuil")} inputMode="numeric" /></Champ>
        </div>
        <Champ label="Note"><textarea className={inputCls} rows={2} value={v.note} onChange={set("note")} /></Champ>
        <div className="flex flex-col gap-1"><span className="text-[0.72rem] uppercase tracking-[0.05em] text-faint">Photo (facultatif)</span><PhotoField dossier="dispensaire-stock" value={v.photo} onChange={(url) => setV((p) => ({ ...p, photo: url }))} label="Photo de l'objet" /></div>
        {err ? <p className="text-[0.8rem]" style={{ color: "var(--oxblood)" }}>{err}</p> : null}
        <div className="mt-1 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-border bg-surface-2 px-3.5 py-2 text-[0.82rem] font-semibold hover:border-border-2">Annuler</button>
          <button onClick={go} className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[0.82rem] font-semibold text-black/85" style={{ background: "var(--accent)" }}><Check className="h-3.5 w-3.5" /> Enregistrer</button>
        </div>
      </div>
    </Modal>
  );
}

function ConfirmCoffre({ nom, onCancel, onConfirm }: { nom: string; onCancel: () => void; onConfirm: () => void }) {
  return (
    <Modal titre="Supprimer le coffre ?" onClose={onCancel} max={420}>
      <div className="flex flex-col gap-3">
        <p className="text-[0.85rem] text-muted">Supprimer <b className="text-ink">{nom}</b> ? Les objets rangés dedans ne sont pas supprimés — ils repassent en <b>Non rangé</b>.</p>
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="rounded-lg border border-border bg-surface-2 px-3.5 py-2 text-[0.82rem] font-semibold hover:border-border-2">Annuler</button>
          <button onClick={onConfirm} className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[0.82rem] font-semibold text-white" style={{ background: "var(--oxblood)" }}><Trash2 className="h-3.5 w-3.5" /> Supprimer</button>
        </div>
      </div>
    </Modal>
  );
}

function ConfirmItem({ nom, onCancel, onConfirm }: { nom: string; onCancel: () => void; onConfirm: () => void }) {
  return (
    <Modal titre="Supprimer l'objet ?" onClose={onCancel} max={400}>
      <div className="flex flex-col gap-3">
        <p className="text-[0.85rem] text-muted">Supprimer <b className="text-ink">{nom}</b> du coffre ? Les mouvements déjà tracés sont conservés.</p>
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="rounded-lg border border-border bg-surface-2 px-3.5 py-2 text-[0.82rem] font-semibold hover:border-border-2">Annuler</button>
          <button onClick={onConfirm} className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[0.82rem] font-semibold text-white" style={{ background: "var(--oxblood)" }}><Trash2 className="h-3.5 w-3.5" /> Supprimer</button>
        </div>
      </div>
    </Modal>
  );
}
