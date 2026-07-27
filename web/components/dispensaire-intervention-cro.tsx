"use client";

import { useState } from "react";
import { Check, Loader2, ClipboardCheck } from "lucide-react";
import { Modal, Champ, inputCls } from "@/components/edit-ui";
import type { Intervention } from "@/lib/dispensaire-interventions-const";
import { terminerIntervention, majIntervention } from "@/app/dispensaire/interventions/actions";

type FlashOut = { t: "ok" | "bad"; m: string };

// Compte-rendu opératoire : saisie à la clôture ou édition ultérieure.
export function DispensaireInterventionCRO({ interv, mode, onClose, onDone }: { interv: Intervention; mode: "terminer" | "editer"; onClose: () => void; onDone: (f: FlashOut) => void }) {
  const [f, setF] = useState({
    type: interv.type || "", chirurgien: interv.chirurgien || "", assistants: interv.assistants || "", salle: interv.salle || "",
    soinsRealises: interv.soinsRealises || "", complications: interv.complications || "", compteRendu: interv.compteRendu || "", note: interv.note || "",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF((p) => ({ ...p, [k]: e.target.value }));

  async function valider() {
    setBusy(true); setErr(null);
    const r = mode === "terminer" ? await terminerIntervention(interv.id, f) : await majIntervention(interv.id, f);
    setBusy(false);
    if (!r.ok) { setErr(r.error || "Enregistrement impossible."); return; }
    onDone({ t: "ok", m: mode === "terminer" ? "Intervention terminée — CRO enregistré." : "Compte-rendu mis à jour." });
    onClose();
  }

  return (
    <Modal titre={`${mode === "terminer" ? "Terminer" : "Compte-rendu"} — ${interv.patient}`} onClose={onClose} max={680}>
      <div className="flex flex-col gap-3">
        <div className="grid gap-2 sm:grid-cols-2">
          <Champ label="Type d'intervention"><input className={inputCls} value={f.type} onChange={set("type")} placeholder="Suture, extraction…" /></Champ>
          <Champ label="Chirurgien"><input className={inputCls} value={f.chirurgien} onChange={set("chirurgien")} placeholder="Dr…" /></Champ>
          <Champ label="Assistants"><input className={inputCls} value={f.assistants} onChange={set("assistants")} placeholder="Personnel présent" /></Champ>
          <Champ label="Salle"><input className={inputCls} value={f.salle} onChange={set("salle")} placeholder="Bloc, salle…" /></Champ>
        </div>
        <Champ label="Gestes / soins réalisés"><textarea className={inputCls} rows={3} value={f.soinsRealises} onChange={set("soinsRealises")} placeholder="Détaille les gestes pratiqués…" /></Champ>
        <Champ label="Complications"><textarea className={inputCls} rows={2} value={f.complications} onChange={set("complications")} placeholder="Aucune, ou détaille…" /></Champ>
        <Champ label="Compte-rendu"><textarea className={inputCls} rows={3} value={f.compteRendu} onChange={set("compteRendu")} placeholder="Récit opératoire, suites, consignes…" /></Champ>
        <Champ label="Note (facultatif)"><input className={inputCls} value={f.note} onChange={set("note")} placeholder="Observation" /></Champ>

        {err ? <p className="text-[0.8rem]" style={{ color: "var(--oxblood)" }}>{err}</p> : null}

        <div className="flex items-center justify-end gap-2 border-t border-border pt-3">
          <button onClick={onClose} className="rounded-lg border border-border bg-surface-2 px-3.5 py-2 text-[0.82rem] font-semibold hover:border-border-2">Annuler</button>
          <button onClick={valider} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[0.82rem] font-semibold text-black/85 disabled:opacity-60" style={{ background: mode === "terminer" ? "var(--good)" : "var(--accent)" }}>{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : mode === "terminer" ? <Check className="h-3.5 w-3.5" /> : <ClipboardCheck className="h-3.5 w-3.5" />} {mode === "terminer" ? "Terminer l'intervention" : "Enregistrer le CRO"}</button>
        </div>
      </div>
    </Modal>
  );
}
