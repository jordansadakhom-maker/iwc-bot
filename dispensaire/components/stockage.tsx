"use client";

import { useMemo, useState } from "react";
import { Boxes, Minus, Plus, Pencil, Trash2, History, PackagePlus, X, Camera, Check } from "lucide-react";
import { ajusterStock, ajouterArticle, majArticle, supprimerArticle, definirStock, lireStockPhoto, appliquerScanStock } from "@/app/actions";
import type { StockLigne, Mouvement } from "@/lib/data";
import { Bloc, Vide, useMoi, ChampMoi } from "./ui";
import { useAction, useConfirm, useToast } from "./ux";
import { PhotoDrop } from "./photo-drop";

const CATEGORIES = ["Coffre", "Matière première", "Matériel", "Nourriture", "Médicament"];

function quand(iso: string) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }) + " " + d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

function LigneStock({ a, moi }: { a: StockLigne; moi: string }) {
  const { run, isPending } = useAction();
  const confirm = useConfirm();
  const toast = useToast();
  const [pas, setPas] = useState(1);
  const [motif, setMotif] = useState("");
  const [edit, setEdit] = useState(false);
  const [editQ, setEditQ] = useState<string | null>(null);
  const [f, setF] = useState({ nom: a.nom, categorie: a.categorie, lieu: a.lieu || "", seuil: String(a.seuil), unite: a.unite || "" });

  const enAlerte = a.seuil > 0 && a.quantite <= a.seuil;
  const couleur = a.quantite === 0 ? "var(--oxblood)" : enAlerte ? "var(--warn)" : "var(--ink)";

  function adj(sign: 1 | -1) {
    if (!moi.trim()) { toast("Indique ton nom en haut.", "err"); return; }
    run(() => ajusterStock(a.id, sign * Math.max(1, pas), moi, motif)).then((ok) => { if (ok) setMotif(""); });
  }
  function definir() {
    const v = Number(editQ); setEditQ(null);
    if (!Number.isFinite(v) || v === a.quantite) return;
    if (!moi.trim()) { toast("Indique ton nom en haut.", "err"); return; }
    run(() => definirStock(a.id, v, moi), "Quantité corrigée.");
  }

  return (
    <li className="rise border-b border-[var(--line)]/60 px-4 py-2.5 last:border-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: a.quantite === 0 ? "var(--oxblood)" : enAlerte ? "var(--warn)" : "var(--good)" }} />
        <span className="min-w-0 flex-1 font-medium">
          {a.nom}
          {a.lieu ? <span className="text-[0.76rem] text-[var(--faint)]"> · {a.lieu}</span> : null}
          {a.seuil > 0 ? <span className="text-[0.72rem] text-[var(--faint)]"> · seuil {a.seuil}</span> : null}
        </span>
        {editQ === null ? (
          <button className="tabnum editable text-[1.15rem] font-bold" style={{ color: couleur }} title="Cliquer pour corriger" onClick={() => setEditQ(String(a.quantite))}>
            {a.quantite}<span className="ml-0.5 text-[0.7rem] font-normal text-[var(--faint)]">{a.unite || ""}</span>
          </button>
        ) : (
          <input className="inp tabnum !w-20 !py-1 text-center" autoFocus type="number" value={editQ} onChange={(e) => setEditQ(e.target.value)} onBlur={definir} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setEditQ(null); }} />
        )}
        <div className="flex items-center gap-1">
          <button className="btn !px-2 !py-1" title="Retirer" onClick={() => adj(-1)} disabled={isPending}><Minus className="h-3.5 w-3.5" /></button>
          <input className="inp tabnum !w-14 !py-1 text-center !text-[0.85rem]" type="number" min={1} value={pas} onChange={(e) => setPas(Math.max(1, Number(e.target.value) || 1))} />
          <button className="btn !px-2 !py-1" title="Ajouter" onClick={() => adj(1)} disabled={isPending}><Plus className="h-3.5 w-3.5" /></button>
          <button className="btn !px-2 !py-1" title="Modifier la fiche" onClick={() => setEdit((v) => !v)}><Pencil className="h-3.5 w-3.5" /></button>
          <button className="btn !px-2 !py-1" title="Supprimer" style={{ color: "var(--oxblood)" }} onClick={async () => { if (await confirm(`Supprimer « ${a.nom} » et son historique ?`, { danger: true, ok: "Supprimer" })) run(() => supprimerArticle(a.id), "Article supprimé."); }}><Trash2 className="h-3.5 w-3.5" /></button>
        </div>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        <input className="inp !py-1 !text-[0.82rem]" style={{ maxWidth: 320 }} value={motif} onChange={(e) => setMotif(e.target.value)} placeholder="motif du mouvement (soin, réappro…) — optionnel" />
      </div>
      {edit ? (
        <div className="mt-2 grid gap-2 rounded-[6px] border border-[var(--line)] bg-[var(--paper-2)]/50 p-3 sm:grid-cols-2">
          <label className="text-[0.72rem] text-[var(--faint)]">Nom<input className="inp mt-0.5" value={f.nom} onChange={(e) => setF({ ...f, nom: e.target.value })} /></label>
          <label className="text-[0.72rem] text-[var(--faint)]">Catégorie<input className="inp mt-0.5" list="disp-cat" value={f.categorie} onChange={(e) => setF({ ...f, categorie: e.target.value })} /></label>
          <label className="text-[0.72rem] text-[var(--faint)]">Emplacement / coffre<input className="inp mt-0.5" value={f.lieu} onChange={(e) => setF({ ...f, lieu: e.target.value })} /></label>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[0.72rem] text-[var(--faint)]">Seuil d&apos;alerte<input className="inp mt-0.5 tabnum" type="number" min={0} value={f.seuil} onChange={(e) => setF({ ...f, seuil: e.target.value })} /></label>
            <label className="text-[0.72rem] text-[var(--faint)]">Unité<input className="inp mt-0.5" value={f.unite} onChange={(e) => setF({ ...f, unite: e.target.value })} placeholder="pce, kg…" /></label>
          </div>
          <div className="flex gap-2 sm:col-span-2">
            <button className="btn-accent btn" disabled={isPending} onClick={() => run(() => majArticle(a.id, { nom: f.nom, categorie: f.categorie, lieu: f.lieu, seuil: Number(f.seuil), unite: f.unite }), "Fiche mise à jour.").then((ok) => { if (ok) setEdit(false); })}>Enregistrer</button>
            <button className="btn" onClick={() => setEdit(false)}><X className="h-4 w-4" /> Annuler</button>
          </div>
        </div>
      ) : null}
    </li>
  );
}

// ── Panneau de scan photo (IA) ───────────────────────────────────
function ScanPhoto({ moi, onClose }: { moi: string; onClose: () => void }) {
  const { run, isPending } = useAction();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [items, setItems] = useState<{ nom: string; quantite: number }[] | null>(null);
  const [mode, setMode] = useState<"add" | "set">("add");

  async function lire(base64: string, mediaType: string) {
    setBusy(true);
    const r = await lireStockPhoto(base64, mediaType);
    setBusy(false);
    if (!r.ok || !r.items) { toast(r.error || "Lecture impossible.", "err"); return; }
    setItems(r.items);
  }
  function appliquer() {
    if (!items?.length) return;
    run(() => appliquerScanStock(items, mode, moi)).then((ok) => {
      if (ok) { toast(`${mode === "add" ? "Cumulé" : "Remplacé"} — stock mis à jour.`, "ok"); setItems(null); onClose(); }
    });
  }

  return (
    <div className="rounded-[8px] border border-[var(--line)] bg-[var(--card)] p-4">
      <div className="mb-3 flex items-center gap-2">
        <Camera className="h-4 w-4 text-[var(--muted)]" />
        <h2 className="font-display text-[1.05rem]">Mettre à jour par photo</h2>
        <button className="btn !px-2 !py-1 ml-auto" onClick={onClose}><X className="h-4 w-4" /></button>
      </div>
      {!items ? (
        <PhotoDrop onImage={lire} busy={busy} />
      ) : (
        <div>
          <div className="mb-2 flex items-center gap-2">
            <span className="text-[0.82rem] text-[var(--muted)]">{items.length} article(s) détecté(s) —</span>
            <div className="flex gap-1">
              <button className={`chip ${mode === "add" ? "on" : ""}`} onClick={() => setMode("add")}>Cumuler (+)</button>
              <button className={`chip ${mode === "set" ? "on" : ""}`} onClick={() => setMode("set")}>Remplacer (=)</button>
            </div>
          </div>
          <ul className="mb-3 max-h-[260px] overflow-auto rounded-[6px] border border-[var(--line)]">
            {items.map((it, i) => (
              <li key={i} className="flex items-center gap-2 border-b border-[var(--line)]/60 px-3 py-1.5 last:border-0">
                <input className="inp !py-1 flex-1" value={it.nom} onChange={(e) => setItems(items.map((x, j) => j === i ? { ...x, nom: e.target.value } : x))} />
                <input className="inp tabnum !w-20 !py-1 text-center" type="number" min={0} value={it.quantite} onChange={(e) => setItems(items.map((x, j) => j === i ? { ...x, quantite: Number(e.target.value) || 0 } : x))} />
                <button className="btn !px-2 !py-1" style={{ color: "var(--oxblood)" }} onClick={() => setItems(items.filter((_, j) => j !== i))}><X className="h-3.5 w-3.5" /></button>
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <button className="btn-accent btn" disabled={isPending} onClick={appliquer}>{isPending ? <span className="spin" /> : <Check className="h-4 w-4" />} Appliquer au stock</button>
            <button className="btn" onClick={() => setItems(null)}>Reprendre une photo</button>
          </div>
        </div>
      )}
    </div>
  );
}

export function Stockage({ stock, mouvements }: { stock: StockLigne[]; mouvements: Mouvement[] }) {
  const { run, isPending } = useAction();
  const toast = useToast();
  const [moi, setMoi] = useMoi();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [ouvrirAjout, setOuvrirAjout] = useState(false);
  const [ouvrirScan, setOuvrirScan] = useState(false);
  const [nouv, setNouv] = useState({ nom: "", categorie: "Matière première", lieu: "", quantite: "0", seuil: "0", unite: "" });

  const cats = useMemo(() => [...new Set(stock.map((a) => a.categorie))].sort(), [stock]);
  const filtre = q.trim().toLowerCase();
  const groupes = useMemo(() => {
    let src = stock;
    if (cat) src = src.filter((a) => a.categorie === cat);
    if (filtre) src = src.filter((a) => (a.nom + " " + (a.lieu || "") + " " + a.categorie).toLowerCase().includes(filtre));
    const map = new Map<string, StockLigne[]>();
    for (const a of src) { const k = a.categorie || "Autre"; (map.get(k) || map.set(k, []).get(k)!).push(a); }
    return [...map.entries()];
  }, [stock, filtre, cat]);

  function ajouter() {
    if (!nouv.nom.trim()) { toast("Nom requis.", "err"); return; }
    run(() => ajouterArticle({ nom: nouv.nom, categorie: nouv.categorie, lieu: nouv.lieu, quantite: Number(nouv.quantite), seuil: Number(nouv.seuil), unite: nouv.unite }), "Article ajouté.").then((ok) => {
      if (ok) { setNouv({ nom: "", categorie: nouv.categorie, lieu: nouv.lieu, quantite: "0", seuil: "0", unite: "" }); setOuvrirAjout(false); }
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <datalist id="disp-cat">{CATEGORIES.map((c) => <option key={c} value={c} />)}</datalist>

      <div className="flex flex-wrap items-center gap-3">
        <ChampMoi moi={moi} onChange={setMoi} />
        <input className="inp" style={{ maxWidth: 240 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher…" />
        <div className="ml-auto flex gap-2">
          <button className="btn" onClick={() => { setOuvrirScan((v) => !v); setOuvrirAjout(false); }}><Camera className="h-4 w-4" /> Scanner une photo</button>
          <button className="btn-accent btn" onClick={() => { setOuvrirAjout((v) => !v); setOuvrirScan(false); }}><PackagePlus className="h-4 w-4" /> Nouvel article</button>
        </div>
      </div>

      {cats.length > 1 ? (
        <div className="flex flex-wrap gap-1.5">
          <button className={`chip ${cat === "" ? "on" : ""}`} onClick={() => setCat("")}>Tout ({stock.length})</button>
          {cats.map((c) => <button key={c} className={`chip ${cat === c ? "on" : ""}`} onClick={() => setCat(c)}>{c} ({stock.filter((a) => a.categorie === c).length})</button>)}
        </div>
      ) : null}

      {ouvrirScan ? <ScanPhoto moi={moi} onClose={() => setOuvrirScan(false)} /> : null}

      {ouvrirAjout ? (
        <div className="grid gap-2 rounded-[8px] border border-[var(--line)] bg-[var(--card)] p-4 sm:grid-cols-3">
          <label className="text-[0.72rem] text-[var(--faint)]">Nom<input className="inp mt-0.5" value={nouv.nom} onChange={(e) => setNouv({ ...nouv, nom: e.target.value })} placeholder="Bandage, Whisky…" /></label>
          <label className="text-[0.72rem] text-[var(--faint)]">Catégorie<input className="inp mt-0.5" list="disp-cat" value={nouv.categorie} onChange={(e) => setNouv({ ...nouv, categorie: e.target.value })} /></label>
          <label className="text-[0.72rem] text-[var(--faint)]">Emplacement / coffre<input className="inp mt-0.5" value={nouv.lieu} onChange={(e) => setNouv({ ...nouv, lieu: e.target.value })} placeholder="Coffre 1, Réserve…" /></label>
          <label className="text-[0.72rem] text-[var(--faint)]">Quantité<input className="inp mt-0.5 tabnum" type="number" min={0} value={nouv.quantite} onChange={(e) => setNouv({ ...nouv, quantite: e.target.value })} /></label>
          <label className="text-[0.72rem] text-[var(--faint)]">Seuil d&apos;alerte<input className="inp mt-0.5 tabnum" type="number" min={0} value={nouv.seuil} onChange={(e) => setNouv({ ...nouv, seuil: e.target.value })} /></label>
          <label className="text-[0.72rem] text-[var(--faint)]">Unité<input className="inp mt-0.5" value={nouv.unite} onChange={(e) => setNouv({ ...nouv, unite: e.target.value })} placeholder="pce, kg…" /></label>
          <div className="flex items-center gap-2 sm:col-span-3">
            <button className="btn-accent btn" onClick={ajouter} disabled={isPending}>{isPending ? <span className="spin" /> : null} Enregistrer l&apos;article</button>
          </div>
        </div>
      ) : null}

      {stock.length === 0 ? (
        <Bloc titre="Stock" icon={<Boxes className="h-4 w-4 text-[var(--muted)]" />}><Vide>Aucun article. Ajoute-les à la main, ou glisse une photo du coffre pour que l&apos;IA les lise.</Vide></Bloc>
      ) : groupes.length === 0 ? (
        <Bloc titre="Stock" icon={<Boxes className="h-4 w-4 text-[var(--muted)]" />}><Vide>Aucun article ne correspond à ta recherche.</Vide></Bloc>
      ) : (
        groupes.map(([c, arts]) => (
          <Bloc key={c} titre={c} icon={<Boxes className="h-4 w-4 text-[var(--muted)]" />} compteur={arts.length}>
            <ul>{arts.map((a) => <LigneStock key={a.id} a={a} moi={moi} />)}</ul>
          </Bloc>
        ))
      )}

      <Bloc titre="Traçabilité des mouvements" icon={<History className="h-4 w-4 text-[var(--muted)]" />} compteur={mouvements.length}>
        {mouvements.length === 0 ? <Vide>Aucun mouvement enregistré.</Vide> : (
          <ul className="max-h-[420px] overflow-auto">
            {mouvements.map((m) => (
              <li key={m.id} className="flex items-center gap-3 border-b border-[var(--line)]/60 px-4 py-2 text-[0.85rem] last:border-0">
                <span className="tabnum w-14 shrink-0 text-right font-bold" style={{ color: m.delta >= 0 ? "var(--good)" : "var(--oxblood)" }}>{m.delta >= 0 ? "+" : ""}{m.delta}</span>
                <span className="min-w-0 flex-1 truncate">{m.stockNom}{m.motif ? <span className="text-[var(--faint)]"> — {m.motif}</span> : null}</span>
                <span className="hidden shrink-0 text-[0.78rem] text-[var(--muted)] sm:inline">{m.auteur || "—"}</span>
                {m.quantiteApres != null ? <span className="tabnum shrink-0 text-[0.78rem] text-[var(--faint)]">→ {m.quantiteApres}</span> : null}
                <span className="shrink-0 text-[0.72rem] text-[var(--faint)] tabnum">{quand(m.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </Bloc>
    </div>
  );
}
