"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Plus, Trash2, Loader2, PackageMinus, LogOut } from "lucide-react";
import { Modal, Champ, inputCls } from "@/components/edit-ui";
import { money } from "@/lib/dispensaire-facturation-const";
import { getConsultationRefs, terminerAvecFacture } from "@/app/dispensaire/factures/actions";
import { terminerPriseEnCharge } from "@/app/dispensaire/prises-en-charge/actions";
import type { PriseEnCharge } from "@/lib/dispensaire-prises-en-charge-const";

type LigneUI = { desc: string; quantite: string; prix: string; stockId: string };
const ligneVide = (): LigneUI => ({ desc: "", quantite: "1", prix: "", stockId: "" });
type Stock = { id: string; nom: string; stock: number };
type FlashOut = { t: "ok" | "bad"; m: string };

// Clôture d'une prise en charge : un seul geste → facture + décrément stock +
// épisode terminé. Le patient est celui de la prise en charge (non modifiable).
export function DispensairePecCloture({ pec, onClose, onDone }: { pec: PriseEnCharge; onClose: () => void; onDone: (f: FlashOut) => void }) {
  const [lignes, setLignes] = useState<LigneUI[]>([ligneVide()]);
  const [regle, setRegle] = useState(true);
  const [note, setNote] = useState("");
  const [stock, setStock] = useState<Stock[]>([]);
  const [busy, setBusy] = useState<"" | "facture" | "sans">("");
  const [err, setErr] = useState<string | null>(null);
  const cleRef = useRef("");
  const jeton = () => (cleRef.current ||= (globalThis.crypto?.randomUUID?.() ?? String(Date.now()) + Math.random()));

  useEffect(() => { let ok = true; getConsultationRefs().then((r) => { if (ok) setStock(r.stock); }).catch(() => {}); return () => { ok = false; }; }, []);

  const total = useMemo(() => lignes.reduce((a, l) => a + (Number(l.prix) || 0) * Math.max(1, Math.round(Number(l.quantite) || 1)), 0), [lignes]);
  const setL = (i: number, patch: Partial<LigneUI>) => setLignes((p) => p.map((l, k) => (k === i ? { ...l, ...patch } : l)));
  const pickStock = (i: number, stockId: string) => { const it = stock.find((s) => s.id === stockId); setLignes((p) => p.map((l, k) => (k === i ? { ...l, stockId, desc: l.desc || (it?.nom ?? "") } : l))); };
  const addL = () => setLignes((p) => [...p, ligneVide()]);
  const rmL = (i: number) => setLignes((p) => (p.length > 1 ? p.filter((_, k) => k !== i) : p));

  async function facturer() {
    const payload = lignes.map((l) => ({ desc: l.desc.trim(), quantite: Math.max(1, Math.round(Number(l.quantite) || 1)), prixUnitaire: Math.max(0, Number(l.prix) || 0), stockId: l.stockId || null })).filter((l) => l.desc || l.prixUnitaire > 0 || l.stockId);
    if (!payload.length) { setErr("Ajoute au moins un soin ou un article (ou clôture sans facture)."); return; }
    setErr(null); setBusy("facture");
    const r = await terminerAvecFacture(pec.id, { lignes: payload, regle, note, cle: jeton() });
    setBusy("");
    if (!r.ok) { setErr(r.error || "Clôture impossible."); return; }
    const base = `Prise en charge terminée — facture ${money(r.montant || total)} · ${regle ? "réglée" : "à créditer"}.`;
    onDone({ t: "ok", m: r.avertissements?.length ? `${base} ⚠ ${r.avertissements.join(" ; ")}` : base });
    onClose();
  }

  async function sansFacture() {
    setErr(null); setBusy("sans");
    const r = await terminerPriseEnCharge(pec.id);
    setBusy("");
    if (!r.ok) { setErr(r.error || "Clôture impossible."); return; }
    onDone({ t: "ok", m: "Prise en charge terminée (sans facture)." });
    onClose();
  }

  return (
    <Modal titre={`Terminer — ${pec.patient}`} onClose={onClose} max={680}>
      <div className="flex flex-col gap-3">
        <p className="text-[0.76rem] text-faint">Note ce qui a été fait : la facture est générée et le stock décompté en un seul geste. Sans acte facturable, tu peux clôturer sans facture.</p>
        <datalist id="cloture-articles">{stock.map((s) => <option key={s.id} value={s.nom} />)}</datalist>

        {/* Lignes */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-[0.72rem] uppercase tracking-[0.05em] text-faint">Soins / articles</span>
            <button onClick={addL} className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface-2 px-2 py-1 text-[0.72rem] font-semibold text-muted hover:text-ink"><Plus className="h-3.5 w-3.5" /> Ajouter</button>
          </div>
          {lignes.map((l, i) => (
            <div key={i} className="grid grid-cols-[1fr_auto] items-start gap-2 rounded-[10px] border border-border bg-surface-2 p-2 sm:grid-cols-[1fr_64px_84px_auto]">
              <input className={inputCls} list="cloture-articles" value={l.desc} onChange={(e) => setL(i, { desc: e.target.value })} placeholder="Soin ou article (ex. Bandage, morphine…)" />
              <input className={inputCls + " hidden sm:block"} inputMode="numeric" value={l.quantite} onChange={(e) => setL(i, { quantite: e.target.value.replace(/[^0-9]/g, "") })} aria-label="Quantité" title="Quantité" />
              <input className={inputCls + " hidden sm:block"} inputMode="numeric" value={l.prix} onChange={(e) => setL(i, { prix: e.target.value.replace(/[^0-9]/g, "") })} placeholder="$" aria-label="Prix unitaire" title="Prix unitaire ($)" />
              <div className="flex items-center gap-1.5">
                <div className="flex gap-1.5 sm:hidden">
                  <input className={inputCls + " w-14"} inputMode="numeric" value={l.quantite} onChange={(e) => setL(i, { quantite: e.target.value.replace(/[^0-9]/g, "") })} aria-label="Quantité" placeholder="Qté" />
                  <input className={inputCls + " w-16"} inputMode="numeric" value={l.prix} onChange={(e) => setL(i, { prix: e.target.value.replace(/[^0-9]/g, "") })} placeholder="$" aria-label="Prix" />
                </div>
                <button onClick={() => rmL(i)} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-border text-faint hover:text-ink" aria-label="Retirer la ligne" title="Retirer"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
              <label className="col-span-2 flex items-center gap-1.5 text-[0.72rem] text-muted sm:col-span-4">
                <PackageMinus className="h-3.5 w-3.5 text-faint" />
                <span className="shrink-0">Décompter du stock :</span>
                <select className={inputCls + " py-1 text-[0.78rem]"} value={l.stockId} onChange={(e) => pickStock(i, e.target.value)}>
                  <option value="">— non</option>
                  {stock.map((s) => <option key={s.id} value={s.id}>{s.nom} (réserve : {s.stock})</option>)}
                </select>
              </label>
            </div>
          ))}
        </div>

        {/* Règlement */}
        <div className="flex flex-col gap-1">
          <span className="text-[0.72rem] uppercase tracking-[0.05em] text-faint">Règlement</span>
          <div className="flex gap-1.5">
            <button onClick={() => setRegle(true)} className="flex-1 rounded-lg border px-2.5 py-1.5 text-[0.8rem] font-semibold" style={regle ? { background: "var(--accent)", color: "#000", borderColor: "transparent" } : { borderColor: "var(--border)", color: "var(--muted)" }}>Réglé maintenant</button>
            <button onClick={() => setRegle(false)} className="flex-1 rounded-lg border px-2.5 py-1.5 text-[0.8rem] font-semibold" style={!regle ? { background: "var(--oxblood)", color: "#fff", borderColor: "transparent" } : { borderColor: "var(--border)", color: "var(--muted)" }}>À créditer</button>
          </div>
        </div>

        <Champ label="Note (facultatif)"><input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Observation, contexte…" /></Champ>

        {err ? <p className="text-[0.8rem]" style={{ color: "var(--oxblood)" }}>{err}</p> : null}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
          <div className="text-[0.86rem]"><span className="text-faint">Total facturé</span> <b className="font-num text-[1.05rem]">{money(total)}</b></div>
          <div className="flex flex-wrap gap-2">
            <button onClick={sansFacture} disabled={!!busy} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-3 py-2 text-[0.8rem] font-semibold text-muted hover:text-ink disabled:opacity-60">{busy === "sans" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LogOut className="h-3.5 w-3.5" />} Clôturer sans facture</button>
            <button onClick={facturer} disabled={!!busy} className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[0.82rem] font-semibold text-black/85 disabled:opacity-60" style={{ background: "var(--good)" }}>{busy === "facture" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Terminer &amp; facturer</button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
