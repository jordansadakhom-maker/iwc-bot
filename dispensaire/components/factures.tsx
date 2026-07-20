"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { Lock, ReceiptText, Plus, Trash2, Check, RotateCcw, AlertTriangle, CircleDollarSign } from "lucide-react";
import { chargerFactures, ajouterFacture, marquerPayee, supprimerFacture } from "@/app/actions";
import type { FactureRow } from "@/lib/data";
import { Bloc, Vide } from "./ui";
import { useConfirm, useToast } from "./ux";

const prix = (n: number) => `${n.toFixed(2).replace(".", ",")} $`;
function aujourdhui() { try { return new Date().toISOString().slice(0, 10); } catch { return ""; } }
function joli(d: string | null) { if (!d) return "—"; const [y, m, j] = d.split("-"); return `${j}/${m}/${y}`; }

function LigneFacture({ code, f, refresh, today }: { code: string; f: FactureRow; refresh: () => void; today: string }) {
  const confirm = useConfirm();
  const toast = useToast();
  const enRetard = !f.paye && !!f.echeance && f.echeance < today;
  async function toggle() { const r = await marquerPayee(code, f.id, !f.paye); if (r.ok) { toast(f.paye ? "Remise en impayée." : "Marquée payée.", "ok"); refresh(); } else toast(r.error || "Échec.", "err"); }
  async function suppr() { if (!(await confirm(`Supprimer la facture de ${f.patient} ?`, { danger: true, ok: "Supprimer" }))) return; const r = await supprimerFacture(code, f.id); if (r.ok) { toast("Supprimée.", "ok"); refresh(); } else toast(r.error || "Échec.", "err"); }
  return (
    <li className="rise flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-[var(--line)]/60 px-4 py-2.5 last:border-0">
      {enRetard ? <AlertTriangle className="h-4 w-4 shrink-0" style={{ color: "var(--oxblood)" }} /> : <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: f.paye ? "var(--good)" : "var(--warn)" }} />}
      <span className="min-w-0 flex-1">
        <span className={`font-medium ${f.paye ? "line-through opacity-60" : ""}`}>{f.patient}</span>
        {f.motif ? <span className="text-[0.82rem] text-[var(--muted)]"> · {f.motif}</span> : null}
        <span className="ml-1 text-[0.76rem]" style={{ color: enRetard ? "var(--oxblood)" : "var(--faint)" }}>
          {f.echeance ? (enRetard ? `échéance dépassée le ${joli(f.echeance)}` : `échéance ${joli(f.echeance)}`) : "sans échéance"}
        </span>
      </span>
      <span className="tabnum font-bold" style={{ color: "var(--accent)" }}>{prix(f.montant)}</span>
      <button className="btn !px-2 !py-1" onClick={toggle} title={f.paye ? "Marquer impayée" : "Marquer payée"}>{f.paye ? <RotateCcw className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}</button>
      <button className="btn !px-2 !py-1" onClick={suppr} title="Supprimer" style={{ color: "var(--oxblood)" }}><Trash2 className="h-3.5 w-3.5" /></button>
    </li>
  );
}

export function Factures() {
  const toast = useToast();
  const [code, setCode] = useState("");
  const [saisie, setSaisie] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [factures, setFactures] = useState<FactureRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [nouv, setNouv] = useState({ patient: "", montant: "", motif: "", echeance: "" });
  const today = aujourdhui();

  const charger = useCallback(async (c: string) => {
    const r = await chargerFactures(c);
    if (!r.ok) { setErr(r.error || "Échec."); setUnlocked(false); return false; }
    setFactures(r.factures || []); setCode(c); setUnlocked(true); setErr(null);
    try { sessionStorage.setItem("disp_code", c); } catch {}
    return true;
  }, []);
  useEffect(() => { try { const c = sessionStorage.getItem("disp_code"); if (c) charger(c); } catch {} }, [charger]);
  const refresh = () => charger(code);

  const { retard, aVenir, reglees, duRetard } = useMemo(() => {
    const retard: FactureRow[] = [], aVenir: FactureRow[] = [], reglees: FactureRow[] = [];
    for (const f of factures) { if (f.paye) reglees.push(f); else if (f.echeance && f.echeance < today) retard.push(f); else aVenir.push(f); }
    return { retard, aVenir, reglees, duRetard: retard.reduce((a, f) => a + f.montant, 0) };
  }, [factures, today]);

  async function deverrouiller() { setBusy(true); await charger(saisie.trim()); setBusy(false); }
  async function ajouter() {
    if (nouv.patient.trim().length < 2) { toast("Nom du patient requis.", "err"); return; }
    setBusy(true); const r = await ajouterFacture(code, { patient: nouv.patient, montant: Number(nouv.montant), motif: nouv.motif, echeance: nouv.echeance }); setBusy(false);
    if (!r.ok) { toast(r.error || "Échec.", "err"); return; }
    toast("Facture enregistrée.", "ok"); setNouv({ patient: "", montant: "", motif: "", echeance: "" }); refresh();
  }

  if (!unlocked) return (
    <div className="mx-auto max-w-[420px] rounded-[8px] border border-[var(--line)] bg-[var(--card)] p-6 text-center">
      <Lock className="mx-auto mb-2 h-6 w-6 text-[var(--accent)]" />
      <h2 className="font-display text-[1.2rem]">Onglet réservé — Factures</h2>
      <p className="mb-4 mt-1 text-[0.84rem] text-[var(--muted)]">Accès réservé aux chefs. Saisis le code du dispensaire.</p>
      <div className="flex gap-2">
        <input className="inp" type="password" value={saisie} onChange={(e) => setSaisie(e.target.value)} placeholder="Code d'accès" onKeyDown={(e) => { if (e.key === "Enter") deverrouiller(); }} autoFocus />
        <button className="btn-accent btn" onClick={deverrouiller} disabled={busy}>{busy ? <span className="spin" /> : null} Ouvrir</button>
      </div>
      {err ? <p className="mt-2 text-[0.8rem]" style={{ color: "var(--oxblood)" }}>{err}</p> : null}
    </div>
  );

  return (
    <div className="flex flex-col gap-5">
      {retard.length > 0 ? (
        <div className="flex items-center gap-3 rounded-[8px] border px-4 py-3" style={{ borderColor: "var(--oxblood)", background: "color-mix(in srgb, var(--oxblood) 8%, var(--card))" }}>
          <AlertTriangle className="h-5 w-5 shrink-0" style={{ color: "var(--oxblood)" }} />
          <span className="text-[0.9rem]"><b>{retard.length}</b> facture{retard.length > 1 ? "s" : ""} en retard de paiement — total dû <b className="tabnum">{prix(duRetard)}</b>.</span>
        </div>
      ) : null}

      <div className="rounded-[8px] border border-[var(--line)] bg-[var(--card)] p-4">
        <h2 className="mb-3 flex items-center gap-2 font-display text-[1.05rem]"><Plus className="h-4 w-4 text-[var(--muted)]" /> Nouvelle facture patient</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          <input className="inp" value={nouv.patient} onChange={(e) => setNouv({ ...nouv, patient: e.target.value })} placeholder="Patient" />
          <input className="inp tabnum" type="number" step="0.01" min={0} value={nouv.montant} onChange={(e) => setNouv({ ...nouv, montant: e.target.value })} placeholder="Montant $" />
          <input className="inp" value={nouv.motif} onChange={(e) => setNouv({ ...nouv, motif: e.target.value })} placeholder="Motif (soin, opération…)" />
          <label className="text-[0.72rem] text-[var(--faint)]">Échéance de paiement<input className="inp mt-0.5" type="date" value={nouv.echeance} onChange={(e) => setNouv({ ...nouv, echeance: e.target.value })} /></label>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <button className="btn-accent btn" onClick={ajouter} disabled={busy}>{busy ? <span className="spin" /> : <Plus className="h-4 w-4" />} Enregistrer</button>
        </div>
      </div>

      <Bloc titre="En retard" icon={<AlertTriangle className="h-4 w-4" style={{ color: "var(--oxblood)" }} />} compteur={retard.length}>
        {retard.length === 0 ? <Vide>Aucune facture en retard. 👏</Vide> : <ul>{retard.map((f) => <LigneFacture key={f.id} code={code} f={f} refresh={refresh} today={today} />)}</ul>}
      </Bloc>
      <Bloc titre="À échoir / impayées" icon={<CircleDollarSign className="h-4 w-4 text-[var(--muted)]" />} compteur={aVenir.length}>
        {aVenir.length === 0 ? <Vide>Rien à échoir.</Vide> : <ul>{aVenir.map((f) => <LigneFacture key={f.id} code={code} f={f} refresh={refresh} today={today} />)}</ul>}
      </Bloc>
      <Bloc titre="Réglées" icon={<ReceiptText className="h-4 w-4 text-[var(--muted)]" />} compteur={reglees.length}>
        {reglees.length === 0 ? <Vide>Aucune facture réglée.</Vide> : <ul>{reglees.map((f) => <LigneFacture key={f.id} code={code} f={f} refresh={refresh} today={today} />)}</ul>}
      </Bloc>
    </div>
  );
}
