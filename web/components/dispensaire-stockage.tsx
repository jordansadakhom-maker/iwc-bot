"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Boxes, Plus, Search, Check, Pencil, Trash2, AlertTriangle, Archive, ArrowDownRight, ArrowUpRight, History } from "lucide-react";
import { CATEGORIES, catLabel, enAlerte, type StockData, type StockItem, type StockMouvement } from "@/lib/dispensaire-stock-const";
import { Modal, Flash, Champ, Picker, PhotoField, inputCls } from "@/components/edit-ui";
import { VideRegistre } from "@/components/dispensaire-ui";
import { creerItem, majItem, supprimerItem, ajusterStock } from "@/app/dispensaire/stockage/actions";

type FlashMsg = { t: "ok" | "bad"; m: string } | null;
const norm = (x: string) => x.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const dtFR = (iso: string) => { try { return new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso)); } catch { return "—"; } };
const catTone: Record<string, string> = { medicament: "var(--accent)", materiel: "var(--muted)", matiere: "var(--warn)", nourriture: "var(--good)", autre: "var(--faint)" };

export function DispensaireStockage({ data }: { data: StockData }) {
  const router = useRouter();
  const [items, setItems] = useState<StockItem[]>(data.items);
  const [mvts, setMvts] = useState<StockMouvement[]>(data.mouvements);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [coffreF, setCoffreF] = useState("");
  const [seulAlerte, setSeulAlerte] = useState(false);
  const [flash, setFlash] = useState<FlashMsg>(null);
  const [form, setForm] = useState<StockItem | "new" | null>(null);
  const [delId, setDelId] = useState<string | null>(null);

  const query = norm(q.trim());
  const liste = useMemo(() => items.filter((it) =>
    (!cat || it.categorie === cat) &&
    (!coffreF || (it.coffre || "") === coffreF) &&
    (!seulAlerte || enAlerte(it)) &&
    (!query || norm([it.nom, it.coffre, it.note, catLabel(it.categorie)].filter(Boolean).join(" ")).includes(query))
  ), [items, cat, coffreF, seulAlerte, query]);

  const coffres = useMemo(() => [...new Set(items.map((i) => (i.coffre || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b)), [items]);
  const alertes = useMemo(() => items.filter(enAlerte), [items]);

  // Regroupe par coffre.
  const groupes = useMemo(() => {
    const m = new Map<string, StockItem[]>();
    for (const it of liste) { const k = (it.coffre || "").trim() || "Sans coffre"; (m.get(k) || m.set(k, []).get(k))!.push(it); }
    return [...m.entries()].sort((a, b) => (a[0] === "Sans coffre" ? 1 : b[0] === "Sans coffre" ? -1 : a[0].localeCompare(b[0])));
  }, [liste]);

  async function enregistrer(vals: Record<string, string>, editing: StockItem | null) {
    const clean = { ...vals, stock: Number(vals.stock) || 0, stockFixe: Number(vals.stockFixe) || 0, seuil: Number(vals.seuil) || 0 };
    if (editing) {
      setItems((p) => p.map((it) => (it.id === editing.id ? { ...it, ...clean } as StockItem : it))); setForm(null);
      const r = await majItem(editing.id, clean);
      if (!r.ok) setFlash({ t: "bad", m: r.error || "Impossible." }); else router.refresh();
    } else {
      const tmp: StockItem = { id: "tmp-" + Math.random().toString(36).slice(2, 8), nom: vals.nom, categorie: vals.categorie || "materiel", coffre: vals.coffre || null, unite: vals.unite || null, stock: clean.stock, stockFixe: clean.stockFixe, seuil: clean.seuil, note: vals.note || null, photo: vals.photo || null, updatedAt: null, updatedBy: null };
      setItems((p) => [...p, tmp]); setForm(null);
      const r = await creerItem(clean);
      if (!r.ok) { setItems((p) => p.filter((it) => it.id !== tmp.id)); setFlash({ t: "bad", m: r.error || "Impossible." }); }
      else { setItems((p) => p.map((it) => (it.id === tmp.id ? { ...it, id: r.id || tmp.id } : it))); setFlash({ t: "ok", m: "Article ajouté." }); router.refresh(); }
    }
  }
  async function supprimer(id: string) { setItems((p) => p.filter((it) => it.id !== id)); setDelId(null); const r = await supprimerItem(id); if (!r.ok) setFlash({ t: "bad", m: r.error || "Impossible." }); else router.refresh(); }

  async function ajuster(it: StockItem, delta: number, motif: string) {
    const apres = Math.max(0, it.stock + delta);
    setItems((p) => p.map((x) => (x.id === it.id ? { ...x, stock: apres } : x)));
    const tmp: StockMouvement = { id: "tmp-" + Math.random().toString(36).slice(2, 8), stockId: it.id, nomItem: it.nom, coffre: it.coffre, delta, apres, motif: motif || null, par: null, createdAt: new Date().toISOString() };
    setMvts((p) => [tmp, ...p].slice(0, 60));
    const r = await ajusterStock(it.id, delta, motif);
    if (!r.ok) { setItems((p) => p.map((x) => (x.id === it.id ? { ...x, stock: it.stock } : x))); setMvts((p) => p.filter((m) => m.id !== tmp.id)); setFlash({ t: "bad", m: r.error || "Impossible." }); }
    else router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      {!data.pret ? <Flash tone="bad">Lance <b>web/prisma/sql/dispensaire-stock.sql</b> dans Supabase, puis recharge.</Flash> : null}
      {flash ? <Flash tone={flash.t === "ok" ? "good" : "bad"}>{flash.m}</Flash> : null}

      {/* Barre d'action */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-2.5">
          <h3 className="flex items-center gap-2 text-[0.95rem] font-semibold"><Boxes className="h-4 w-4 text-accent" /> Stockage</h3>
          <span className="font-num text-[0.8rem] text-faint">{items.length}</span>
          {alertes.length ? <button onClick={() => setSeulAlerte((v) => !v)} className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.68rem] font-bold text-white" style={{ background: "var(--oxblood)", opacity: seulAlerte ? 1 : 0.85 }}><AlertTriangle className="h-3 w-3" /> {alertes.length} en alerte</button> : null}
        </div>
        <button onClick={() => setForm("new")} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[0.76rem] font-semibold text-black/85" style={{ background: "var(--accent)" }}><Plus className="h-3.5 w-3.5" strokeWidth={2} /> Ajouter article</button>
      </div>

      {/* Alertes */}
      {alertes.length && !seulAlerte ? (
        <div className="rounded-[12px] border p-3" style={{ borderColor: "color-mix(in srgb,var(--oxblood) 45%,var(--border))", background: "color-mix(in srgb,var(--oxblood) 6%,transparent)" }}>
          <div className="mb-1.5 flex items-center gap-1.5 text-[0.78rem] font-semibold" style={{ color: "var(--oxblood)" }}><AlertTriangle className="h-3.5 w-3.5" /> Sous le seuil</div>
          <div className="flex flex-wrap gap-1.5">
            {alertes.map((it) => <span key={it.id} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-2 px-2 py-1 text-[0.72rem]"><span className="font-semibold">{it.nom}</span><span className="font-num" style={{ color: "var(--oxblood)" }}>{it.stock}{it.unite ? ` ${it.unite}` : ""}</span><span className="text-faint">/ seuil {it.seuil}</span></span>)}
          </div>
        </div>
      ) : null}

      {/* Filtres */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[180px] flex-1"><Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" /><input className={inputCls + " pl-8"} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un article, un coffre…" /></div>
        <select className={inputCls + " max-w-[170px]"} value={cat} onChange={(e) => setCat(e.target.value)}><option value="">Toutes catégories</option>{CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}</select>
        {coffres.length ? <select className={inputCls + " max-w-[170px]"} value={coffreF} onChange={(e) => setCoffreF(e.target.value)}><option value="">Tous les coffres</option>{coffres.map((c) => <option key={c} value={c}>{c}</option>)}</select> : null}
      </div>

      {/* Articles par coffre */}
      {liste.length === 0 ? (
        items.length
          ? <p className="px-1 py-10 text-center text-[0.85rem] italic text-faint">Aucun article ne correspond à ta recherche.</p>
          : <VideRegistre icon={Boxes} titre="Les coffres sont encore vides" sous="Ajoute un premier article — remède, matériel ou matière — et l'inventaire se tiendra à jour, coffre par coffre." />
      ) : groupes.map(([coffre, its]) => (
        <section key={coffre}>
          <div className="mb-1.5 flex items-center gap-1.5 text-[0.74rem] font-semibold uppercase tracking-[0.05em] text-faint"><Archive className="h-3.5 w-3.5" /> {coffre} <span className="font-num">({its.length})</span></div>
          <div className="grid gap-2.5 lg:grid-cols-2">
            {its.map((it) => <ItemCard key={it.id} it={it} onEdit={() => setForm(it)} onDel={() => setDelId(it.id)} onAdjust={ajuster} />)}
          </div>
        </section>
      ))}

      {/* Traçabilité */}
      {mvts.length ? (
        <section className="rounded-[14px] border border-border bg-surface p-4">
          <h3 className="mb-2 flex items-center gap-2 text-[0.9rem] font-semibold"><History className="h-4 w-4 text-accent" /> Traçabilité des mouvements</h3>
          <div className="flex flex-col divide-y divide-border">
            {mvts.slice(0, 30).map((m) => (
              <div key={m.id} className="flex items-center gap-2 py-1.5 text-[0.78rem]">
                <span className="inline-flex w-14 shrink-0 items-center gap-1 font-num font-bold" style={{ color: m.delta >= 0 ? "var(--good)" : "var(--oxblood)" }}>{m.delta >= 0 ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}{m.delta >= 0 ? "+" : ""}{m.delta}</span>
                <span className="min-w-0 flex-1 truncate"><b className="font-semibold">{m.nomItem}</b>{m.motif ? <span className="text-faint"> — {m.motif}</span> : null}</span>
                <span className="shrink-0 text-faint">{m.apres != null ? <span className="font-num">→ {m.apres}</span> : null} · {dtFR(m.createdAt)}{m.par ? ` · ${m.par}` : ""}</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {form ? <ItemForm initial={form === "new" ? null : form} coffres={coffres} onClose={() => setForm(null)} onSave={(v) => enregistrer(v, form === "new" ? null : form)} /> : null}
      {delId ? <ConfirmDelete nom={items.find((i) => i.id === delId)?.nom || ""} onCancel={() => setDelId(null)} onConfirm={() => supprimer(delId)} /> : null}
    </div>
  );
}

function ItemCard({ it, onEdit, onDel, onAdjust }: { it: StockItem; onEdit: () => void; onDel: () => void; onAdjust: (it: StockItem, delta: number, motif: string) => void }) {
  const [qte, setQte] = useState("1");
  const [motif, setMotif] = useState("");
  const alerte = enAlerte(it);
  const q = Math.max(1, Math.round(Number(qte) || 1));
  function mouv(sens: 1 | -1) { onAdjust(it, sens * q, motif.trim()); setMotif(""); setQte("1"); }
  return (
    <div className="rounded-[12px] border p-3" style={{ borderColor: alerte ? "color-mix(in srgb,var(--oxblood) 50%,var(--border))" : "var(--border)", background: "var(--surface-2)" }}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2.5">
          {it.photo ? (
            <a href={it.photo} target="_blank" rel="noreferrer" className="shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={it.photo} alt={it.nom} className="h-12 w-12 rounded-[8px] border border-border object-cover transition hover:brightness-110" />
            </a>
          ) : null}
          <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[0.9rem] font-semibold">{it.nom}</span>
            <span className="rounded-full px-1.5 py-0.5 text-[0.6rem] font-bold uppercase" style={{ color: catTone[it.categorie] || "var(--muted)", background: `color-mix(in srgb,${catTone[it.categorie] || "var(--muted)"} 14%,transparent)` }}>{catLabel(it.categorie)}</span>
            {alerte ? <span className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[0.6rem] font-bold text-white" style={{ background: "var(--oxblood)" }}><AlertTriangle className="h-2.5 w-2.5" /> alerte</span> : null}
          </div>
          {it.note ? <div className="mt-0.5 text-[0.72rem] text-faint">{it.note}</div> : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button onClick={onEdit} className="grid h-7 w-7 place-items-center rounded-md border border-border text-faint hover:text-ink" aria-label="Modifier"><Pencil className="h-3.5 w-3.5" /></button>
          <button onClick={onDel} className="grid h-7 w-7 place-items-center rounded-md border border-border text-faint hover:text-oxblood" aria-label="Supprimer"><Trash2 className="h-3.5 w-3.5" /></button>
        </div>
      </div>
      <div className="mt-2 flex items-end gap-3">
        <div><div className="font-num text-[1.5rem] font-bold leading-none" style={{ color: alerte ? "var(--oxblood)" : "var(--ink)" }}>{it.stock}</div><div className="text-[0.62rem] text-faint">{it.unite || "en stock"}</div></div>
        <div className="mb-0.5 flex flex-col gap-0.5 text-[0.66rem] text-faint">
          <span>Fixe : <b className="font-num text-muted">{it.stockFixe}</b></span>
          <span>Seuil : <b className="font-num text-muted">{it.seuil}</b></span>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-border pt-2">
        <input className={inputCls + " w-16 text-center"} value={qte} onChange={(e) => setQte(e.target.value.replace(/[^0-9]/g, ""))} inputMode="numeric" aria-label="Quantité" />
        <input className={inputCls + " min-w-[110px] flex-1"} value={motif} onChange={(e) => setMotif(e.target.value)} placeholder="Motif (optionnel)" />
        <button onClick={() => mouv(1)} className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[0.72rem] font-semibold text-black/85" style={{ background: "var(--good)" }}><ArrowUpRight className="h-3.5 w-3.5" /> Entrée</button>
        <button onClick={() => mouv(-1)} className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[0.72rem] font-semibold text-white" style={{ background: "var(--oxblood)" }}><ArrowDownRight className="h-3.5 w-3.5" /> Sortie</button>
      </div>
    </div>
  );
}

function ItemForm({ initial, coffres, onClose, onSave }: { initial: StockItem | null; coffres: string[]; onClose: () => void; onSave: (v: Record<string, string>) => void }) {
  const [v, setV] = useState<Record<string, string>>(() => ({
    nom: initial?.nom || "", categorie: initial?.categorie || "materiel", coffre: initial?.coffre || "", unite: initial?.unite || "",
    stock: String(initial?.stock ?? 0), stockFixe: String(initial?.stockFixe ?? 0), seuil: String(initial?.seuil ?? 0), note: initial?.note || "", photo: initial?.photo || "",
  }));
  const [err, setErr] = useState<string | null>(null);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV((p) => ({ ...p, [k]: e.target.value }));
  const setNum = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setV((p) => ({ ...p, [k]: e.target.value.replace(/[^0-9]/g, "") }));
  function go() { if (v.nom.trim().length < 1) { setErr("Le nom est obligatoire."); return; } onSave(v); }
  return (
    <Modal titre={initial ? "✏️ Modifier l'article" : "➕ Ajouter un article"} onClose={onClose} max={560}>
      <div className="flex flex-col gap-3">
        <Champ label="Nom *"><input className={inputCls} value={v.nom} onChange={set("nom")} placeholder="Bandages, morphine, bois…" autoFocus /></Champ>
        <div className="flex flex-col gap-1"><span className="text-[0.72rem] uppercase tracking-[0.05em] text-faint">Catégorie</span><Picker options={CATEGORIES.map((c) => ({ key: c.key, label: c.label, tone: catTone[c.key] }))} value={v.categorie} onChange={(x) => setV((p) => ({ ...p, categorie: x }))} /></div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Champ label="Coffre / emplacement"><input className={inputCls} value={v.coffre} onChange={set("coffre")} placeholder="Coffre principal…" list="disp-coffres" /><datalist id="disp-coffres">{coffres.map((c) => <option key={c} value={c} />)}</datalist></Champ>
          <Champ label="Unité"><input className={inputCls} value={v.unite} onChange={set("unite")} placeholder="u, flacon, kg…" /></Champ>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Champ label="Stock actuel"><input className={inputCls} value={v.stock} onChange={setNum("stock")} inputMode="numeric" /></Champ>
          <Champ label="Stock fixe (cible)"><input className={inputCls} value={v.stockFixe} onChange={setNum("stockFixe")} inputMode="numeric" /></Champ>
          <Champ label="Seuil d'alerte"><input className={inputCls} value={v.seuil} onChange={setNum("seuil")} inputMode="numeric" /></Champ>
        </div>
        <Champ label="Note"><textarea className={inputCls} rows={2} value={v.note} onChange={set("note")} /></Champ>
        <div className="flex flex-col gap-1"><span className="text-[0.72rem] uppercase tracking-[0.05em] text-faint">Photo (facultatif)</span><PhotoField dossier="dispensaire-stock" value={v.photo} onChange={(url) => setV((p) => ({ ...p, photo: url }))} label="Photo de l'article ou du contenu du coffre" /></div>
        {err ? <p className="text-[0.8rem]" style={{ color: "var(--oxblood)" }}>{err}</p> : null}
        <div className="mt-1 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-border bg-surface-2 px-3.5 py-2 text-[0.82rem] font-semibold hover:border-border-2">Annuler</button>
          <button onClick={go} className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[0.82rem] font-semibold text-black/85" style={{ background: "var(--accent)" }}><Check className="h-3.5 w-3.5" /> Enregistrer</button>
        </div>
      </div>
    </Modal>
  );
}

function ConfirmDelete({ nom, onCancel, onConfirm }: { nom: string; onCancel: () => void; onConfirm: () => void }) {
  return (
    <Modal titre="Supprimer l'article ?" onClose={onCancel} max={400}>
      <div className="flex flex-col gap-3">
        <p className="text-[0.85rem] text-muted">Supprimer <b className="text-ink">{nom}</b> du stock ? Les mouvements déjà tracés sont conservés.</p>
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="rounded-lg border border-border bg-surface-2 px-3.5 py-2 text-[0.82rem] font-semibold hover:border-border-2">Annuler</button>
          <button onClick={onConfirm} className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[0.82rem] font-semibold text-white" style={{ background: "var(--oxblood)" }}><Trash2 className="h-3.5 w-3.5" /> Supprimer</button>
        </div>
      </div>
    </Modal>
  );
}
