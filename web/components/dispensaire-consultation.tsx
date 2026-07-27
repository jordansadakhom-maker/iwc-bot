"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Stethoscope, Plus, Trash2, Check, Loader2, PackageMinus } from "lucide-react";
import { Modal, Champ, inputCls } from "@/components/edit-ui";
import { FACTURE_DELAI_H, money } from "@/lib/dispensaire-facturation-const";
import { getConsultationRefs, creerConsultation, type ConsultationLigne } from "@/app/dispensaire/factures/actions";

// ── Consultation unifiée ─────────────────────────────────────────────────────
// Un seul écran : patient + soins/articles → facture générée + (option) stock
// décrémenté. Remplace « saisir la vente PUIS re-saisir la facture ». La date
// d'émission est saisie (défaut aujourd'hui), l'échéance à 72 h est automatique.

type LigneUI = { desc: string; quantite: string; prix: string; stockId: string };
const ligneVide = (): LigneUI => ({ desc: "", quantite: "1", prix: "", stockId: "" });
type Refs = { patients: string[]; stock: { id: string; nom: string; stock: number }[] };
type FlashOut = { t: "ok" | "bad"; m: string };

function ymdAuj() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
function ymdPlus72(iso: string) { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso); if (!m) return ""; const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])); d.setUTCDate(d.getUTCDate() + Math.round(FACTURE_DELAI_H / 24)); return d.toISOString().slice(0, 10); }

export function DispensaireConsultation({ onClose, onDone }: { onClose: () => void; onDone: (f: FlashOut) => void }) {
  const [patient, setPatient] = useState("");
  const [lignes, setLignes] = useState<LigneUI[]>([ligneVide()]);
  const [regle, setRegle] = useState(true);
  const [emission, setEmission] = useState(ymdAuj());
  const [note, setNote] = useState("");
  const [refs, setRefs] = useState<Refs>({ patients: [], stock: [] });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Jeton anti-doublon : une seule consultation par ouverture de la modale,
  // même en cas de double-clic ou de retry réseau.
  const cleRef = useRef("");
  const jeton = () => (cleRef.current ||= (globalThis.crypto?.randomUUID?.() ?? String(Date.now()) + Math.random()));

  useEffect(() => { let ok = true; getConsultationRefs().then((r) => { if (ok) setRefs(r); }).catch(() => {}); return () => { ok = false; }; }, []);

  const total = useMemo(() => lignes.reduce((a, l) => a + (Number(l.prix) || 0) * Math.max(1, Math.round(Number(l.quantite) || 1)), 0), [lignes]);
  const echeance = ymdPlus72(emission);

  const setL = (i: number, patch: Partial<LigneUI>) => setLignes((p) => p.map((l, k) => (k === i ? { ...l, ...patch } : l)));
  const pickStock = (i: number, stockId: string) => {
    const item = refs.stock.find((s) => s.id === stockId);
    setLignes((p) => p.map((l, k) => (k === i ? { ...l, stockId, desc: l.desc || (item?.nom ?? "") } : l)));
  };
  const addL = () => setLignes((p) => [...p, ligneVide()]);
  const rmL = (i: number) => setLignes((p) => (p.length > 1 ? p.filter((_, k) => k !== i) : p));

  async function valider() {
    setErr(null);
    if (!patient.trim()) { setErr("Indique le patient."); return; }
    const payload: ConsultationLigne[] = lignes
      .map((l) => ({ desc: l.desc.trim(), quantite: Math.max(1, Math.round(Number(l.quantite) || 1)), prixUnitaire: Math.max(0, Number(l.prix) || 0), stockId: l.stockId || null }))
      .filter((l) => l.desc || l.prixUnitaire > 0 || l.stockId);
    if (!payload.length) { setErr("Ajoute au moins un soin ou un article."); return; }
    setBusy(true);
    const r = await creerConsultation({ patient, lignes: payload, regle, dateEmission: emission, note, cle: jeton() });
    setBusy(false);
    if (!r.ok) { setErr(r.error || "Enregistrement impossible."); return; }
    const base = `Consultation enregistrée — ${money(r.montant || total)} · ${regle ? "réglée" : "à créditer (impayé)"}.`;
    onDone({ t: "ok", m: r.avertissements?.length ? `${base} ⚠ ${r.avertissements.join(" ; ")}` : base });
    onClose();
  }

  return (
    <Modal titre="Nouvelle consultation" onClose={onClose} max={680}>
      <div className="flex flex-col gap-3">
        <p className="text-[0.76rem] text-faint">Un seul geste : le patient, ce qui a été fait, et c&apos;est facturé. Coche un article pour le <b>décompter du stock</b>.</p>

        <datalist id="consult-patients">{refs.patients.map((p) => <option key={p} value={p} />)}</datalist>
        <datalist id="consult-articles">{refs.stock.map((s) => <option key={s.id} value={s.nom} />)}</datalist>

        <Champ label="Patient *"><input className={inputCls} list="consult-patients" value={patient} onChange={(e) => setPatient(e.target.value)} placeholder="Prénom Nom" autoFocus /></Champ>

        {/* Lignes */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-[0.72rem] uppercase tracking-[0.05em] text-faint">Soins / articles</span>
            <button onClick={addL} className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface-2 px-2 py-1 text-[0.72rem] font-semibold text-muted hover:text-ink"><Plus className="h-3.5 w-3.5" /> Ajouter</button>
          </div>
          {lignes.map((l, i) => (
            <div key={i} className="grid grid-cols-[1fr_auto] items-start gap-2 rounded-[10px] border border-border bg-surface-2 p-2 sm:grid-cols-[1fr_64px_84px_auto]">
              <input className={inputCls} list="consult-articles" value={l.desc} onChange={(e) => setL(i, { desc: e.target.value })} placeholder="Soin ou article (ex. Bandage, morphine…)" />
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
                  {refs.stock.map((s) => <option key={s.id} value={s.id}>{s.nom} (réserve : {s.stock})</option>)}
                </select>
              </label>
            </div>
          ))}
        </div>

        {/* Règlement + date */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <span className="text-[0.72rem] uppercase tracking-[0.05em] text-faint">Règlement</span>
            <div className="flex gap-1.5">
              <button onClick={() => setRegle(true)} className="flex-1 rounded-lg border px-2.5 py-1.5 text-[0.8rem] font-semibold" style={regle ? { background: "var(--accent)", color: "#000", borderColor: "transparent" } : { borderColor: "var(--border)", color: "var(--muted)" }}>Réglé maintenant</button>
              <button onClick={() => setRegle(false)} className="flex-1 rounded-lg border px-2.5 py-1.5 text-[0.8rem] font-semibold" style={!regle ? { background: "var(--oxblood)", color: "#fff", borderColor: "transparent" } : { borderColor: "var(--border)", color: "var(--muted)" }}>À créditer</button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Champ label="Date d'émission"><input type="date" className={inputCls} value={emission} onChange={(e) => setEmission(e.target.value)} /></Champ>
            <Champ label={`Échéance · +${FACTURE_DELAI_H} h`}><input type="date" className={inputCls + " cursor-not-allowed opacity-70"} value={echeance} readOnly tabIndex={-1} /></Champ>
          </div>
        </div>

        <Champ label="Note (facultatif)"><input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Observation, contexte…" /></Champ>

        {err ? <p className="text-[0.8rem]" style={{ color: "var(--oxblood)" }}>{err}</p> : null}

        <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
          <div className="text-[0.86rem]"><span className="text-faint">Total facturé</span> <b className="font-num text-[1.05rem]">{money(total)}</b></div>
          <div className="flex gap-2">
            <button onClick={onClose} className="rounded-lg border border-border bg-surface-2 px-3.5 py-2 text-[0.82rem] font-semibold hover:border-border-2">Annuler</button>
            <button onClick={valider} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[0.82rem] font-semibold text-black/85 disabled:opacity-60" style={{ background: "var(--accent)" }}>{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Stethoscope className="h-3.5 w-3.5" />} Enregistrer la consultation</button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
