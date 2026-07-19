"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Boxes, Minus, Plus, Pencil, Trash2, History, PackagePlus, X } from "lucide-react";
import { ajusterStock, ajouterArticle, majArticle, supprimerArticle } from "@/app/actions";
import type { StockLigne, Mouvement } from "@/lib/data";
import { Bloc, Vide, useMoi, ChampMoi } from "./ui";

const CATEGORIES = ["Coffre", "Matière première", "Matériel", "Nourriture", "Médicament"];

function quand(iso: string) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }) + " " + d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

function LigneStock({ a, moi, refresh }: { a: StockLigne; moi: string; refresh: () => void }) {
  const [pas, setPas] = useState(1);
  const [motif, setMotif] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [edit, setEdit] = useState(false);
  const [f, setF] = useState({ nom: a.nom, categorie: a.categorie, lieu: a.lieu || "", seuil: String(a.seuil), unite: a.unite || "" });

  const enAlerte = a.seuil > 0 && a.quantite <= a.seuil;
  const couleur = a.quantite === 0 ? "var(--oxblood)" : enAlerte ? "var(--warn)" : "var(--ink)";

  async function adj(sign: 1 | -1) {
    if (!moi.trim()) { setErr("Indique ton nom en haut."); return; }
    setErr(null); setBusy(true);
    const r = await ajusterStock(a.id, sign * Math.max(1, pas), moi, motif);
    setBusy(false);
    if (!r.ok) { setErr(r.error || "Échec."); return; }
    setMotif(""); refresh();
  }
  async function sauverEdit() {
    setBusy(true);
    const r = await majArticle(a.id, { nom: f.nom, categorie: f.categorie, lieu: f.lieu, seuil: Number(f.seuil), unite: f.unite });
    setBusy(false);
    if (!r.ok) { setErr(r.error || "Échec."); return; }
    setEdit(false); refresh();
  }
  async function suppr() {
    if (!confirm(`Supprimer « ${a.nom} » et son historique ?`)) return;
    setBusy(true); const r = await supprimerArticle(a.id); setBusy(false);
    if (!r.ok) { setErr(r.error || "Échec."); return; }
    refresh();
  }

  return (
    <li className="border-b border-[var(--line)]/60 px-4 py-2.5 last:border-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: a.quantite === 0 ? "var(--oxblood)" : enAlerte ? "var(--warn)" : "var(--good)" }} />
        <span className="min-w-0 flex-1 font-medium">
          {a.nom}
          {a.lieu ? <span className="text-[0.76rem] text-[var(--faint)]"> · {a.lieu}</span> : null}
          {a.seuil > 0 ? <span className="text-[0.72rem] text-[var(--faint)]"> · seuil {a.seuil}</span> : null}
        </span>
        <span className="tabnum text-[1.15rem] font-bold" style={{ color: couleur }}>{a.quantite}<span className="ml-0.5 text-[0.7rem] font-normal text-[var(--faint)]">{a.unite || ""}</span></span>
        <div className="flex items-center gap-1">
          <button className="btn !px-2 !py-1" title="Retirer" onClick={() => adj(-1)} disabled={busy}><Minus className="h-3.5 w-3.5" /></button>
          <input className="inp tabnum !w-14 !py-1 text-center !text-[0.85rem]" type="number" min={1} value={pas} onChange={(e) => setPas(Math.max(1, Number(e.target.value) || 1))} />
          <button className="btn !px-2 !py-1" title="Ajouter" onClick={() => adj(1)} disabled={busy}><Plus className="h-3.5 w-3.5" /></button>
          <button className="btn !px-2 !py-1" title="Modifier la fiche" onClick={() => setEdit((v) => !v)}><Pencil className="h-3.5 w-3.5" /></button>
          <button className="btn !px-2 !py-1" title="Supprimer" onClick={suppr} style={{ color: "var(--oxblood)" }}><Trash2 className="h-3.5 w-3.5" /></button>
        </div>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        <input className="inp !py-1 !text-[0.82rem]" style={{ maxWidth: 320 }} value={motif} onChange={(e) => setMotif(e.target.value)} placeholder="motif du mouvement (soin, réappro…) — optionnel" />
        {err ? <span className="text-[0.78rem]" style={{ color: "var(--oxblood)" }}>{err}</span> : null}
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
            <button className="btn-accent btn" onClick={sauverEdit} disabled={busy}>Enregistrer</button>
            <button className="btn" onClick={() => setEdit(false)}><X className="h-4 w-4" /> Annuler</button>
          </div>
        </div>
      ) : null}
    </li>
  );
}

export function Stockage({ stock, mouvements }: { stock: StockLigne[]; mouvements: Mouvement[] }) {
  const router = useRouter();
  const [moi, setMoi] = useMoi();
  const [q, setQ] = useState("");
  const [ouvrirAjout, setOuvrirAjout] = useState(false);
  const [nouv, setNouv] = useState({ nom: "", categorie: "Matière première", lieu: "", quantite: "0", seuil: "0", unite: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const refresh = () => router.refresh();

  const filtre = q.trim().toLowerCase();
  const groupes = useMemo(() => {
    const src = filtre ? stock.filter((a) => (a.nom + " " + (a.lieu || "") + " " + a.categorie).toLowerCase().includes(filtre)) : stock;
    const map = new Map<string, StockLigne[]>();
    for (const a of src) { const k = a.categorie || "Autre"; (map.get(k) || map.set(k, []).get(k)!).push(a); }
    return [...map.entries()];
  }, [stock, filtre]);

  async function ajouter() {
    if (!nouv.nom.trim()) { setErr("Nom requis."); return; }
    setBusy(true);
    const r = await ajouterArticle({ nom: nouv.nom, categorie: nouv.categorie, lieu: nouv.lieu, quantite: Number(nouv.quantite), seuil: Number(nouv.seuil), unite: nouv.unite });
    setBusy(false);
    if (!r.ok) { setErr(r.error || "Échec."); return; }
    setNouv({ nom: "", categorie: nouv.categorie, lieu: nouv.lieu, quantite: "0", seuil: "0", unite: "" });
    setErr(null); setOuvrirAjout(false); refresh();
  }

  return (
    <div className="flex flex-col gap-5">
      <datalist id="disp-cat">{CATEGORIES.map((c) => <option key={c} value={c} />)}</datalist>

      <div className="flex flex-wrap items-center gap-3">
        <ChampMoi moi={moi} onChange={setMoi} />
        <input className="inp" style={{ maxWidth: 260 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un article…" />
        <button className="btn-accent btn ml-auto" onClick={() => setOuvrirAjout((v) => !v)}><PackagePlus className="h-4 w-4" /> Nouvel article</button>
      </div>

      {ouvrirAjout ? (
        <div className="grid gap-2 rounded-[8px] border border-[var(--line)] bg-[var(--card)] p-4 sm:grid-cols-3">
          <label className="text-[0.72rem] text-[var(--faint)]">Nom<input className="inp mt-0.5" value={nouv.nom} onChange={(e) => setNouv({ ...nouv, nom: e.target.value })} placeholder="Bandage, Whisky…" /></label>
          <label className="text-[0.72rem] text-[var(--faint)]">Catégorie<input className="inp mt-0.5" list="disp-cat" value={nouv.categorie} onChange={(e) => setNouv({ ...nouv, categorie: e.target.value })} /></label>
          <label className="text-[0.72rem] text-[var(--faint)]">Emplacement / coffre<input className="inp mt-0.5" value={nouv.lieu} onChange={(e) => setNouv({ ...nouv, lieu: e.target.value })} placeholder="Coffre 1, Réserve…" /></label>
          <label className="text-[0.72rem] text-[var(--faint)]">Quantité<input className="inp mt-0.5 tabnum" type="number" min={0} value={nouv.quantite} onChange={(e) => setNouv({ ...nouv, quantite: e.target.value })} /></label>
          <label className="text-[0.72rem] text-[var(--faint)]">Seuil d&apos;alerte<input className="inp mt-0.5 tabnum" type="number" min={0} value={nouv.seuil} onChange={(e) => setNouv({ ...nouv, seuil: e.target.value })} /></label>
          <label className="text-[0.72rem] text-[var(--faint)]">Unité<input className="inp mt-0.5" value={nouv.unite} onChange={(e) => setNouv({ ...nouv, unite: e.target.value })} placeholder="pce, kg…" /></label>
          <div className="flex items-center gap-2 sm:col-span-3">
            <button className="btn-accent btn" onClick={ajouter} disabled={busy}>Enregistrer l&apos;article</button>
            {err ? <span className="text-[0.8rem]" style={{ color: "var(--oxblood)" }}>{err}</span> : null}
          </div>
        </div>
      ) : null}

      {stock.length === 0 ? (
        <Bloc titre="Stock" icon={<Boxes className="h-4 w-4 text-[var(--muted)]" />}><Vide>Aucun article. Ajoute tes coffres, matières premières, matériel et nourriture ci-dessus.</Vide></Bloc>
      ) : (
        groupes.map(([cat, arts]) => (
          <Bloc key={cat} titre={cat} icon={<Boxes className="h-4 w-4 text-[var(--muted)]" />} compteur={arts.length}>
            <ul>{arts.map((a) => <LigneStock key={a.id} a={a} moi={moi} refresh={refresh} />)}</ul>
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
