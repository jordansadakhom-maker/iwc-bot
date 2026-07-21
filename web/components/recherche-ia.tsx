"use client";

import { useState } from "react";
import { MessagesSquare, Loader2, Send } from "lucide-react";
import { repondreQuestion } from "@/app/(app)/assistant/actions";
import { MicButton, LireBtn } from "@/components/mic-dictee";

const EXEMPLES = [
  "Quels contrats Confrérie sont en attente ?",
  "Qui est absent en ce moment ?",
  "Combien d'opérations en cours ?",
  "Quel est le solde du coffre commun ?",
];

// Question en langage naturel → l'IA répond à partir des vraies données (lecture
// seule, aucune action). Micro pour dicter, bouton pour écouter la réponse.
export function RechercheIA() {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [rep, setRep] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function demander() {
    const question = q.trim();
    if (question.length < 3) { setErr("Pose une question."); return; }
    setBusy(true); setErr(null); setRep(null);
    const r = await repondreQuestion(question);
    setBusy(false);
    if (r.ok && r.texte) setRep(r.texte); else setErr(r.error || "Indisponible.");
  }

  return (
    <div className="rounded-card border border-border bg-surface p-4 shadow-card" style={{ background: "linear-gradient(180deg,var(--surface),color-mix(in srgb,var(--surface) 88%,#000))" }}>
      <div className="mb-2 flex items-center gap-2 text-[0.78rem] font-semibold text-muted">
        <MessagesSquare className="h-4 w-4 text-accent" /> Pose une question sur tes données
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") demander(); }}
          placeholder="Ex : « Quels contrats Confrérie en attente ? »"
          className="flex-1 rounded-[10px] border border-border bg-surface-2 px-3 py-2.5 text-[0.9rem] text-ink outline-none placeholder:text-faint focus:border-[color-mix(in_srgb,var(--accent)_55%,var(--border))]"
          maxLength={500}
        />
        <div className="flex items-center gap-2">
          <MicButton onText={(t) => { setErr(null); setQ((v) => (v ? v.trim() + " " : "") + t); }} onError={(m) => setErr(m)} title="Dicter la question" />
          <button onClick={demander} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2.5 text-[0.84rem] font-semibold text-black/85 disabled:opacity-60" style={{ background: "var(--accent)" }}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" strokeWidth={2} />} Demander
          </button>
        </div>
      </div>

      {!rep && !err ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {EXEMPLES.map((ex) => (
            <button key={ex} onClick={() => setQ(ex)} className="rounded-full border border-border bg-surface-2 px-2.5 py-1 text-[0.72rem] text-muted transition hover:border-border-2 hover:text-ink">{ex}</button>
          ))}
        </div>
      ) : null}

      {err ? <p className="mt-3 text-[0.82rem]" style={{ color: "var(--oxblood)" }}>{err}</p> : null}
      {rep ? (
        <div className="mt-3 rounded-[10px] border border-border bg-surface-2 p-3.5">
          <p className="whitespace-pre-wrap text-[0.9rem] leading-relaxed text-ink">{rep}</p>
          <div className="mt-2.5"><LireBtn texte={rep} /></div>
        </div>
      ) : null}
    </div>
  );
}
