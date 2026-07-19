"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Boxes, Plus, Minus, Loader2, Camera, AlertTriangle, History, X, Check } from "lucide-react";
import type { StockItem, MouvementItem } from "@/lib/queries";
import { Modal, Flash, Champ, Picker, inputCls } from "@/components/edit-ui";
import { PhotoDrop } from "@/components/photo-drop";
import { ajusterStock, lirePhotosInventaire } from "@/app/(app)/inventaire/actions";

type Router = ReturnType<typeof useRouter>;

const CATS = ["Armes", "Munitions", "Provisions", "Médecine", "Matériel", "Commun"];
const CAT_EMOJI: Record<string, string> = { Armes: "🔫", Munitions: "🧨", Provisions: "🥫", "Médecine": "💊", "Matériel": "🧰", Commun: "🎒" };
const dateFR = (s: string | null) => { if (!s) return ""; try { return new Date(s).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }); } catch { return ""; } };

export function InventaireStock({ stock, mouvements }: { stock: StockItem[]; mouvements: MouvementItem[] }) {
  const router = useRouter();
  const [flash, setFlash] = useState<string | null>(null);
  const [nouveau, setNouveau] = useState(false);
  const [photo, setPhoto] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [journal, setJournal] = useState(false);

  const total = stock.reduce((s, i) => s + i.quantite, 0);
  const parCat = CATS.map((c) => ({ cat: c, items: stock.filter((s) => s.categorie === c).sort((a, b) => a.nom.localeCompare(b.nom)) })).filter((g) => g.items.length);

  async function bouger(it: StockItem, mode: "add" | "remove") {
    setBusyId(it.id + mode);
    const r = await ajusterStock(it.categorie, it.nom, mode, 1);
    setBusyId(null);
    setFlash(r.ok ? `${it.nom} ${mode === "add" ? "+1" : "−1"} — mise à jour dans ~30 s.` : (r.error || "Échec."));
    if (r.ok) router.refresh();
  }

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-2.5">
          <h3 className="text-[0.8rem] font-semibold uppercase tracking-[0.06em] text-muted">Coffre commun — stock</h3>
          <span className="font-num text-[0.8rem] text-faint">{total} objet{total > 1 ? "s" : ""}</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setPhoto(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-[0.76rem] font-semibold text-ink transition hover:border-border-2"><Camera className="h-3.5 w-3.5" /> Photo → stock</button>
          <button onClick={() => setNouveau(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-[0.76rem] font-semibold text-ink transition hover:border-border-2"><Plus className="h-3.5 w-3.5" strokeWidth={2} /> Ajouter un objet</button>
        </div>
      </div>

      {flash ? <div className="mb-3"><Flash>{flash}</Flash></div> : null}

      {stock.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
          <Boxes className="h-6 w-6 text-faint" strokeWidth={1.6} />
          <p className="max-w-md text-[0.82rem] leading-relaxed text-muted">Le coffre est vide (ou pas encore synchronisé). Ajoute un objet, ou glisse une photo du coffre en jeu pour le remplir automatiquement.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {parCat.map((g) => (
            <div key={g.cat}>
              <div className="mb-1.5 text-[0.72rem] uppercase tracking-[0.08em] text-muted">{CAT_EMOJI[g.cat]} {g.cat} <span className="ml-1 font-num text-faint">{g.items.reduce((s, i) => s + i.quantite, 0)}</span></div>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {g.items.map((it) => {
                  const bas = it.seuil != null && it.quantite <= it.seuil;
                  return (
                    <div key={it.id} className="flex items-center gap-2 rounded-[10px] border border-border bg-surface-2 px-2.5 py-2">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[0.84rem] font-medium">{it.nom}</div>
                        {bas ? <div className="flex items-center gap-1 text-[0.68rem]" style={{ color: "var(--warn)" }}><AlertTriangle className="h-3 w-3" /> sous le seuil ({it.seuil})</div> : null}
                      </div>
                      <button onClick={() => bouger(it, "remove")} disabled={!!busyId} className="grid h-6 w-6 place-items-center rounded-md border border-border text-muted hover:text-ink disabled:opacity-40" aria-label="Retirer 1">
                        {busyId === it.id + "remove" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Minus className="h-3.5 w-3.5" />}
                      </button>
                      <span className="min-w-[1.6rem] text-center font-num text-[0.9rem] font-semibold">{it.quantite}</span>
                      <button onClick={() => bouger(it, "add")} disabled={!!busyId} className="grid h-6 w-6 place-items-center rounded-md border border-border text-muted hover:text-ink disabled:opacity-40" aria-label="Ajouter 1">
                        {busyId === it.id + "add" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
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

      {nouveau ? <NouveauModal onClose={() => setNouveau(false)} router={router} setFlash={setFlash} /> : null}
      {photo ? <PhotoModal onClose={() => setPhoto(false)} router={router} setFlash={setFlash} /> : null}
    </>
  );
}

function NouveauModal({ onClose, router, setFlash }: { onClose: () => void; router: Router; setFlash: (s: string) => void }) {
  const [categorie, setCategorie] = useState("Commun");
  const [nom, setNom] = useState("");
  const [qte, setQte] = useState("1");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function creer() {
    setErr(null);
    if (nom.trim().length < 1) { setErr("Donne un nom à l'objet."); return; }
    setBusy(true);
    const r = await ajusterStock(categorie, nom, "add", Number(qte) || 1);
    setBusy(false);
    if (!r.ok) { setErr(r.error || "Impossible."); return; }
    setFlash(`${nom} ajouté — mise à jour dans ~30 s.`); router.refresh(); onClose();
  }

  return (
    <Modal titre="➕ Ajouter au coffre" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1"><span className="text-[0.72rem] uppercase tracking-[0.05em] text-faint">Catégorie</span>
          <Picker options={CATS.map((c) => ({ key: c, label: `${CAT_EMOJI[c]} ${c}` }))} value={categorie} onChange={setCategorie} /></div>
        <Champ label="Objet *"><input className={inputCls} value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Carabine Repeater, Balles .44, Conserves…" maxLength={120} autoFocus /></Champ>
        <Champ label="Quantité"><input className={inputCls} type="number" min={1} value={qte} onChange={(e) => setQte(e.target.value)} /></Champ>
        {err ? <p className="text-[0.8rem]" style={{ color: "var(--oxblood)" }}>{err}</p> : null}
        <div className="mt-1 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-border bg-surface-2 px-3.5 py-2 text-[0.82rem] font-semibold hover:border-border-2">Annuler</button>
          <button onClick={creer} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[0.82rem] font-semibold text-black/85 disabled:opacity-60" style={{ background: "var(--accent)" }}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" strokeWidth={2} />} Ajouter
          </button>
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
    setFlash("Photo(s) transmise(s) — l'IA lit le coffre et met à jour le stock (~30 s)."); router.refresh(); onClose();
  }

  return (
    <Modal titre="📸 Photo → mise à jour du coffre" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <p className="text-[0.8rem] text-muted">Glisse 1 à 2 captures de l&apos;inventaire du coffre en jeu. L&apos;IA lit les objets et <b>ajoute</b> les quantités au stock.</p>
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
