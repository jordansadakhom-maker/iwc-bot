"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Boxes, Plus, Minus, Loader2, Camera, AlertTriangle, History, X, Check, SlidersHorizontal, Search, ChevronDown } from "lucide-react";
import type { StockItem, MouvementItem } from "@/lib/queries";
import { Modal, Flash, Champ, Picker, inputCls } from "@/components/edit-ui";
import { PhotoDrop } from "@/components/photo-drop";
import { ajusterStock, lirePhotosInventaire } from "@/app/(app)/inventaire/actions";

type Router = ReturnType<typeof useRouter>;

const CATS = ["Armes", "Munitions", "Provisions", "Médecine", "Matériel", "Commun"];
const CAT_EMOJI: Record<string, string> = { Armes: "🔫", Munitions: "🧨", Provisions: "🥫", "Médecine": "💊", "Matériel": "🧰", Commun: "🎒" };
const CHIPS = [1, 5, 10, 25, 50, 100];
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
const dateFR = (s: string | null) => { if (!s) return ""; try { return new Date(s).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }); } catch { return ""; } };

export function InventaireStock({ stock, mouvements }: { stock: StockItem[]; mouvements: MouvementItem[] }) {
  const router = useRouter();
  // État OPTIMISTE : on affiche le changement à l'instant, le bot applique en ~10 s.
  const [items, setItems] = useState<StockItem[]>(stock);
  const [flash, setFlash] = useState<string | null>(null);
  const [nouveau, setNouveau] = useState(false);
  const [photo, setPhoto] = useState(false);
  const [stepItem, setStepItem] = useState<StockItem | null>(null);
  const [journal, setJournal] = useState(false);
  const [pending, setPending] = useState(0);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [basSeul, setBasSeul] = useState(false); // n'afficher que les objets sous leur seuil

  const total = items.reduce((s, i) => s + i.quantite, 0);
  const parCat = CATS.map((c) => ({ cat: c, items: items.filter((s) => s.categorie === c && s.quantite > 0).sort((a, b) => a.nom.localeCompare(b.nom)) })).filter((g) => g.items.length);
  const query = q.trim().toLowerCase();
  const trouves = query ? items.filter((i) => i.quantite > 0 && i.nom.toLowerCase().includes(query)).sort((a, b) => a.nom.localeCompare(b.nom)) : [];
  // Objets sous leur seuil de réappro (seuil défini ET quantité ≤ seuil) → à recompléter.
  const basItems = items.filter((i) => i.quantite > 0 && i.seuil != null && i.quantite <= i.seuil).sort((a, b) => a.nom.localeCompare(b.nom));
  const flatMode = !!query || basSeul;
  const flatList = query ? trouves : basSeul ? basItems : [];

  // Applique un mouvement en optimiste + envoie au bot (best-effort).
  async function applique(categorie: string, nom: string, mode: "add" | "remove" | "set", qte: number) {
    const q = Math.abs(Math.round(qte)) || 0;
    if (mode !== "set" && q === 0) return;
    // 1) mise à jour immédiate à l'écran
    setItems((prev) => {
      const i = prev.findIndex((x) => x.categorie === categorie && norm(x.nom) === norm(nom));
      if (i === -1) {
        if (mode === "remove" || q === 0) return prev;
        return [...prev, { id: `tmp-${norm(nom)}-${categorie}`, categorie, nom, quantite: mode === "set" ? q : q, seuil: null }];
      }
      const copy = [...prev];
      const cur = copy[i];
      const apres = mode === "add" ? cur.quantite + q : mode === "remove" ? Math.max(0, cur.quantite - q) : q;
      copy[i] = { ...cur, quantite: apres };
      return copy;
    });
    // 2) envoi au bot
    setPending((p) => p + 1);
    const r = await ajusterStock(categorie, nom, mode, q);
    setPending((p) => Math.max(0, p - 1));
    if (!r.ok) { setFlash(r.error || "Échec — le changement pourrait ne pas être enregistré."); }
  }

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-2.5">
          <h3 className="text-[0.8rem] font-semibold uppercase tracking-[0.06em] text-muted">Coffre commun — stock</h3>
          <span className="font-num text-[0.8rem] text-faint">{total} objet{total > 1 ? "s" : ""}</span>
          {basItems.length ? (
            <button onClick={() => setBasSeul((v) => !v)} aria-pressed={basSeul} title={basSeul ? "Afficher tout le stock" : "N'afficher que les objets à recompléter"}
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.68rem] font-bold transition"
              style={{ color: "#fff", background: "var(--warn)", boxShadow: basSeul ? "0 0 0 2px color-mix(in srgb,var(--warn) 45%,transparent)" : "none" }}>
              <AlertTriangle className="h-3 w-3" /> {basItems.length} sous le seuil{basSeul ? " · tout voir" : ""}
            </button>
          ) : null}
          {pending > 0 ? <span className="inline-flex items-center gap-1 text-[0.72rem] text-faint"><Loader2 className="h-3 w-3 animate-spin" /> synchronisation…</span> : null}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setPhoto(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-[0.76rem] font-semibold text-ink transition hover:border-border-2"><Camera className="h-3.5 w-3.5" /> Photo → stock</button>
          <button onClick={() => setNouveau(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-[0.76rem] font-semibold text-ink transition hover:border-border-2"><Plus className="h-3.5 w-3.5" strokeWidth={2} /> Ajouter un objet</button>
        </div>
      </div>

      {flash ? <div className="mb-3"><Flash tone="bad">{flash}</Flash></div> : null}

      {/* Recherche + tout déplier / replier */}
      {items.filter((i) => i.quantite > 0).length > 0 ? (
        <div className="mb-3 flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
            <input className={inputCls + " pl-8"} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un objet…" />
          </div>
          {!flatMode ? (
            <button
              onClick={() => { const allOpen = parCat.every((g) => open[g.cat]); const next: Record<string, boolean> = {}; parCat.forEach((g) => (next[g.cat] = !allOpen)); setOpen(next); }}
              className="shrink-0 rounded-lg border border-border bg-surface-2 px-2.5 py-2 text-[0.74rem] font-semibold text-muted hover:text-ink"
            >
              {parCat.every((g) => open[g.cat]) && parCat.length ? "Tout replier" : "Tout déplier"}
            </button>
          ) : null}
        </div>
      ) : null}

      {items.filter((i) => i.quantite > 0).length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
          <Boxes className="h-6 w-6 text-faint" strokeWidth={1.6} />
          <p className="max-w-md text-[0.82rem] leading-relaxed text-muted">Le coffre est vide (ou pas encore synchronisé). Ajoute un objet, ou glisse une photo du coffre en jeu pour le remplir automatiquement.</p>
        </div>
      ) : flatMode ? (
        // Liste à plat (recherche ou « sous le seuil »), toutes catégories confondues
        flatList.length === 0 ? (
          <p className="px-1 py-6 text-center text-[0.84rem] text-faint">{query ? <>Aucun objet ne correspond à « {q} ».</> : "Aucun objet sous son seuil — le coffre est bien garni."}</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {flatList.map((it) => <ItemCard key={it.id} it={it} applique={applique} onStep={setStepItem} showCat />)}
          </div>
        )
      ) : (
        // Catégories repliables (accordéon)
        <div className="flex flex-col gap-2">
          {parCat.map((g) => {
            const ouvert = !!open[g.cat];
            const totCat = g.items.reduce((s, i) => s + i.quantite, 0);
            return (
              <div key={g.cat} className="overflow-hidden rounded-[12px] border border-border">
                <button onClick={() => setOpen((o) => ({ ...o, [g.cat]: !o[g.cat] }))} className="flex w-full items-center gap-2.5 bg-surface-2 px-3 py-2.5 text-left transition hover:bg-[color-mix(in_srgb,var(--ink)_4%,var(--surface-2))]">
                  <span className="text-[1.05rem]">{CAT_EMOJI[g.cat]}</span>
                  <span className="text-[0.88rem] font-semibold">{g.cat}</span>
                  <span className="text-[0.72rem] text-faint">{g.items.length} objet{g.items.length > 1 ? "s" : ""} · {totCat} u.</span>
                  <ChevronDown className={"ml-auto h-4 w-4 text-faint transition-transform " + (ouvert ? "rotate-180" : "")} strokeWidth={2} />
                </button>
                {ouvert ? (
                  <div className="grid gap-2 border-t border-border p-2.5 sm:grid-cols-2 xl:grid-cols-3">
                    {g.items.map((it) => <ItemCard key={it.id} it={it} applique={applique} onStep={setStepItem} />)}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      {mouvements.length ? (
        <div className="mt-4 border-t border-border pt-3">
          <button onClick={() => setJournal((j) => !j)} className="inline-flex items-center gap-1.5 text-[0.74rem] font-semibold text-muted hover:text-ink"><History className="h-3.5 w-3.5" /> Qui a bougé quoi ({mouvements.length}) {journal ? "▲" : "▼"}</button>
          {journal ? (
            <div className="mt-2 flex flex-col gap-1">
              {mouvements.map((m) => (
                <div key={m.id} className="flex items-center justify-between gap-3 rounded-[8px] border border-border bg-surface-2 px-2.5 py-1.5 text-[0.78rem]">
                  <span className="text-ink">{m.texte}</span>
                  <span className="shrink-0 text-faint">{m.par ? `${m.par} · ` : ""}{dateFR(m.createdAt)}</span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {nouveau ? <NouveauModal onClose={() => setNouveau(false)} onCreer={(cat, nom, q) => applique(cat, nom, "add", q)} /> : null}
      {photo ? <PhotoModal onClose={() => setPhoto(false)} router={router} setFlash={setFlash} /> : null}
      {stepItem ? <StepModal item={stepItem} onClose={() => setStepItem(null)} onApply={(mode, q) => { applique(stepItem.categorie, stepItem.nom, mode, q); setStepItem(null); }} /> : null}
    </>
  );
}

// Carte d'un objet : nom, quantité (clic = montant exact), −1 / +1.
function ItemCard({ it, applique, onStep, showCat = false }: { it: StockItem; applique: (cat: string, nom: string, mode: "add" | "remove" | "set", q: number) => void; onStep: (it: StockItem) => void; showCat?: boolean }) {
  const bas = it.seuil != null && it.quantite <= it.seuil;
  return (
    <div className="flex items-center gap-2 rounded-[10px] border border-border bg-surface-2 px-2.5 py-2">
      <div className="min-w-0 flex-1">
        <div className="truncate text-[0.84rem] font-medium">{it.nom}</div>
        {showCat ? <div className="text-[0.66rem] uppercase tracking-[0.05em] text-faint">{CAT_EMOJI[it.categorie] || ""} {it.categorie}</div> : null}
        {bas ? <div className="flex items-center gap-1 text-[0.68rem]" style={{ color: "var(--warn)" }}><AlertTriangle className="h-3 w-3" /> sous le seuil ({it.seuil})</div> : null}
      </div>
      <button onClick={() => applique(it.categorie, it.nom, "remove", 1)} className="grid h-6 w-6 place-items-center rounded-md border border-border text-muted hover:text-ink" aria-label="Retirer 1"><Minus className="h-3.5 w-3.5" /></button>
      <button onClick={() => onStep(it)} className="min-w-[2rem] rounded-md px-1 text-center font-num text-[0.9rem] font-semibold hover:bg-[color-mix(in_srgb,var(--ink)_6%,transparent)]" title="Montant exact">{it.quantite}</button>
      <button onClick={() => applique(it.categorie, it.nom, "add", 1)} className="grid h-6 w-6 place-items-center rounded-md border border-border text-muted hover:text-ink" aria-label="Ajouter 1"><Plus className="h-3.5 w-3.5" /></button>
      <button onClick={() => onStep(it)} className="grid h-6 w-6 place-items-center rounded-md border border-border text-faint hover:text-ink" aria-label="Montant exact"><SlidersHorizontal className="h-3.5 w-3.5" /></button>
    </div>
  );
}

// Montant EXACT : ajouter / retirer / corriger à, avec des raccourcis (5, 10, 25…).
function StepModal({ item, onClose, onApply }: { item: StockItem; onClose: () => void; onApply: (mode: "add" | "remove" | "set", q: number) => void }) {
  const [mode, setMode] = useState<"add" | "remove" | "set">("add");
  const [qte, setQte] = useState("");
  const modeLabel = mode === "add" ? "Ajouter" : mode === "remove" ? "Retirer" : "Corriger à";
  const apercu = (() => { const q = Math.abs(parseInt(qte, 10) || 0); return mode === "add" ? item.quantite + q : mode === "remove" ? Math.max(0, item.quantite - q) : q; })();

  return (
    <Modal titre={`${item.nom} · ${item.quantite} en stock`} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <Picker options={[{ key: "add", label: "➕ Ajouter" }, { key: "remove", label: "➖ Retirer" }, { key: "set", label: "✏️ Corriger à" }]} value={mode} onChange={(v) => setMode(v as "add" | "remove" | "set")} />
        <div className="flex flex-wrap gap-1.5">
          {CHIPS.map((c) => (
            <button key={c} onClick={() => setQte(String(c))} className="rounded-lg border px-3 py-1.5 text-[0.82rem] font-semibold transition" style={{ color: qte === String(c) ? "#000" : "var(--accent)", background: qte === String(c) ? "var(--accent)" : "transparent", borderColor: "color-mix(in srgb,var(--accent) 40%,var(--border))" }}>{c}</button>
          ))}
        </div>
        <Champ label="Quantité exacte"><input className={inputCls} type="number" min={0} value={qte} onChange={(e) => setQte(e.target.value)} placeholder="Ex : 25" autoFocus /></Champ>
        <p className="text-[0.8rem] text-muted">{modeLabel} <b>{Math.abs(parseInt(qte, 10) || 0)}</b> → nouveau stock : <b className="font-num" style={{ color: "var(--accent)" }}>{apercu}</b></p>
        <div className="mt-1 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-border bg-surface-2 px-3.5 py-2 text-[0.82rem] font-semibold hover:border-border-2">Annuler</button>
          <button onClick={() => onApply(mode, parseInt(qte, 10) || 0)} disabled={qte === "" || (mode !== "set" && (parseInt(qte, 10) || 0) <= 0)} className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[0.82rem] font-semibold text-black/85 disabled:opacity-50" style={{ background: "var(--accent)" }}>
            <Check className="h-3.5 w-3.5" /> Valider
          </button>
        </div>
      </div>
    </Modal>
  );
}

function NouveauModal({ onClose, onCreer }: { onClose: () => void; onCreer: (cat: string, nom: string, q: number) => void }) {
  const [categorie, setCategorie] = useState("Commun");
  const [nom, setNom] = useState("");
  const [qte, setQte] = useState("1");
  const [err, setErr] = useState<string | null>(null);

  function creer() {
    setErr(null);
    if (nom.trim().length < 1) { setErr("Donne un nom à l'objet."); return; }
    onCreer(categorie, nom.trim(), Number(qte) || 1);
    onClose();
  }

  return (
    <Modal titre="➕ Ajouter au coffre" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1"><span className="text-[0.72rem] uppercase tracking-[0.05em] text-faint">Catégorie</span>
          <Picker options={CATS.map((c) => ({ key: c, label: `${CAT_EMOJI[c]} ${c}` }))} value={categorie} onChange={setCategorie} /></div>
        <Champ label="Objet *"><input className={inputCls} value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Carabine Repeater, Balles .44, Conserves…" maxLength={120} autoFocus /></Champ>
        <div className="flex flex-col gap-1.5">
          <span className="text-[0.72rem] uppercase tracking-[0.05em] text-faint">Quantité</span>
          <div className="flex flex-wrap gap-1.5">
            {CHIPS.map((c) => <button key={c} onClick={() => setQte(String(c))} className="rounded-lg border px-3 py-1.5 text-[0.82rem] font-semibold transition" style={{ color: qte === String(c) ? "#000" : "var(--accent)", background: qte === String(c) ? "var(--accent)" : "transparent", borderColor: "color-mix(in srgb,var(--accent) 40%,var(--border))" }}>{c}</button>)}
          </div>
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

function PhotoModal({ onClose, router, setFlash }: { onClose: () => void; router: Router; setFlash: (s: string) => void }) {
  const [urls, setUrls] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function lire() {
    setErr(null);
    if (!urls.length) { setErr("Ajoute au moins une photo."); return; }
    setBusy(true);
    const r = await lirePhotosInventaire(urls);
    setBusy(false);
    if (!r.ok) { setErr(r.error || "Impossible."); return; }
    setFlash("Photo(s) transmise(s) — l'IA lit le coffre et met à jour le stock (~10 s)."); router.refresh(); onClose();
  }

  return (
    <Modal titre="📸 Photo → mise à jour du coffre" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <p className="text-[0.8rem] text-muted">Glisse ou prends en photo 1 à 2 captures de l&apos;inventaire du coffre en jeu. L&apos;IA lit les objets et <b>ajoute</b> les quantités au stock.</p>
        {urls.length < 2 ? <PhotoDrop dossier="inventaire" onUploaded={(u) => setUrls((p) => [...p, u])} label="Glisse une capture du coffre" /> : null}
        {urls.length ? (
          <div className="flex flex-wrap gap-2">
            {urls.map((u, i) => (
              <div key={i} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={u} alt={`Capture ${i + 1}`} className="h-20 w-20 rounded-[8px] border border-border object-cover" />
                <button onClick={() => setUrls((p) => p.filter((_, k) => k !== i))} className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full border border-border bg-surface text-muted hover:text-ink" aria-label="Retirer"><X className="h-3 w-3" /></button>
              </div>
            ))}
          </div>
        ) : null}
        {err ? <p className="text-[0.8rem]" style={{ color: "var(--oxblood)" }}>{err}</p> : null}
        <div className="mt-1 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-border bg-surface-2 px-3.5 py-2 text-[0.82rem] font-semibold hover:border-border-2">Annuler</button>
          <button onClick={lire} disabled={busy || !urls.length} className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[0.82rem] font-semibold text-black/85 disabled:opacity-50" style={{ background: "var(--accent)" }}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" strokeWidth={2} />} Lire &amp; mettre à jour
          </button>
        </div>
      </div>
    </Modal>
  );
}
