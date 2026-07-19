"use client";

import { useState } from "react";
import { FileText, Send, Printer, Eraser, Copy, Check } from "lucide-react";
import { envoyerCertificat } from "@/app/actions";
import { useMoi } from "./ui";

const TYPES = ["Certificat d'aptitude", "Certificat de repos", "Constat de blessure", "Certificat de décès", "Certificat médical"];
const vide = { type: "Certificat médical", patient: "", praticien: "", dateActe: "", diagnostic: "", prescription: "", observations: "" };

function aujourdhui() { try { return new Date().toISOString().slice(0, 10); } catch { return ""; } }
function joli(d: string) { if (!d) return "—"; const [y, m, j] = d.split("-"); return `${j}/${m}/${y}`; }

export function Certificats() {
  const [moi] = useMoi();
  const [f, setF] = useState({ ...vide, praticien: "", dateActe: aujourdhui() });
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<{ t: "ok" | "err"; m: string } | null>(null);
  const [copie, setCopie] = useState(false);

  const praticien = f.praticien || moi;
  const set = (k: keyof typeof f, v: string) => setF((s) => ({ ...s, [k]: v }));

  function texte() {
    const L = (t: string, v: string) => (v ? `${t} : ${v}\n` : "");
    return `${f.type} — Dispensaire de Saint-Denis\n\n` +
      L("Patient", f.patient) + L("Praticien", praticien) + L("Date de l'acte", joli(f.dateActe)) +
      L("Diagnostic", f.diagnostic) + L("Prescription / soins", f.prescription) + L("Observations", f.observations);
  }

  async function envoyer() {
    if (f.patient.trim().length < 2) { setFlash({ t: "err", m: "Indique le nom du patient." }); return; }
    setBusy(true);
    const r = await envoyerCertificat({ ...f, praticien });
    setBusy(false);
    setFlash(r.ok ? { t: "ok", m: "Certificat enregistré et déposé sur Discord." } : { t: "err", m: r.error || "Échec." });
  }
  async function copier() { try { await navigator.clipboard.writeText(texte()); setCopie(true); setTimeout(() => setCopie(false), 1500); } catch {} }
  function effacer() { if (confirm("Effacer le certificat en cours ?")) { setF({ ...vide, praticien: "", dateActe: aujourdhui() }); setFlash(null); } }

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {/* Formulaire */}
      <section className="no-print rounded-[8px] border border-[var(--line)] bg-[var(--card)] p-4">
        <h2 className="mb-1 flex items-center gap-2 font-display text-[1.05rem]"><FileText className="h-4 w-4 text-[var(--muted)]" /> Rédiger un certificat</h2>
        <p className="mb-3 text-[0.82rem] text-[var(--muted)]">Remplis, dépose sur Discord, puis efface pour le suivant.</p>
        <div className="grid gap-2">
          <label className="text-[0.72rem] text-[var(--faint)]">Type
            <select className="inp mt-0.5" value={f.type} onChange={(e) => set("type", e.target.value)}>{TYPES.map((t) => <option key={t}>{t}</option>)}</select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[0.72rem] text-[var(--faint)]">Patient<input className="inp mt-0.5" value={f.patient} onChange={(e) => set("patient", e.target.value)} placeholder="Prénom Nom" /></label>
            <label className="text-[0.72rem] text-[var(--faint)]">Date de l&apos;acte<input className="inp mt-0.5" type="date" value={f.dateActe} onChange={(e) => set("dateActe", e.target.value)} /></label>
          </div>
          <label className="text-[0.72rem] text-[var(--faint)]">Praticien<input className="inp mt-0.5" value={f.praticien} onChange={(e) => set("praticien", e.target.value)} placeholder={moi || "Nom du praticien"} /></label>
          <label className="text-[0.72rem] text-[var(--faint)]">Diagnostic<textarea className="inp mt-0.5" rows={2} value={f.diagnostic} onChange={(e) => set("diagnostic", e.target.value)} /></label>
          <label className="text-[0.72rem] text-[var(--faint)]">Prescription / soins<textarea className="inp mt-0.5" rows={2} value={f.prescription} onChange={(e) => set("prescription", e.target.value)} /></label>
          <label className="text-[0.72rem] text-[var(--faint)]">Observations<textarea className="inp mt-0.5" rows={2} value={f.observations} onChange={(e) => set("observations", e.target.value)} /></label>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button className="btn-accent btn" onClick={envoyer} disabled={busy}><Send className="h-4 w-4" /> Enregistrer &amp; envoyer</button>
          <button className="btn" onClick={() => window.print()}><Printer className="h-4 w-4" /> Imprimer</button>
          <button className="btn" onClick={copier}>{copie ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copie ? "Copié" : "Copier"}</button>
          <button className="btn" onClick={effacer} style={{ color: "var(--oxblood)" }}><Eraser className="h-4 w-4" /> Effacer</button>
        </div>
        {flash ? <p className="mt-2 text-[0.82rem]" style={{ color: flash.t === "ok" ? "var(--good)" : "var(--oxblood)" }}>{flash.m}</p> : null}
      </section>

      {/* Aperçu imprimable */}
      <section className="imprimable rounded-[8px] border border-[var(--line)] bg-[var(--card)] p-6">
        <div className="cartouche rounded-[6px] px-4 py-3 text-center">
          <div className="text-[0.62rem] uppercase tracking-[0.3em] text-[var(--faint)]">État de Louisiane · Comté de Saint-Denis</div>
          <div className="font-display text-[1.3rem] leading-tight">Dispensaire de Saint-Denis</div>
          <div className="text-[0.72rem] uppercase tracking-[0.18em] text-[var(--accent)]">{f.type}</div>
        </div>
        <dl className="mt-5 space-y-3 text-[0.92rem]">
          <Champ t="Patient" v={f.patient} gras />
          <Champ t="Diagnostic" v={f.diagnostic} />
          <Champ t="Prescription / soins" v={f.prescription} />
          <Champ t="Observations" v={f.observations} />
        </dl>
        <div className="regle mt-6 flex items-end justify-between pt-4 text-[0.86rem]">
          <div><span className="text-[var(--faint)]">Fait à Saint-Denis, le</span> <b>{joli(f.dateActe)}</b></div>
          <div className="text-right">
            <div className="text-[var(--faint)]">Le praticien</div>
            <div className="font-display text-[1.05rem]" style={{ color: "var(--accent)" }}>{praticien || "—"}</div>
          </div>
        </div>
      </section>
    </div>
  );
}

function Champ({ t, v, gras }: { t: string; v: string; gras?: boolean }) {
  return (
    <div>
      <dt className="text-[0.68rem] uppercase tracking-[0.12em] text-[var(--faint)]">{t}</dt>
      <dd className={`whitespace-pre-wrap ${gras ? "font-display text-[1.05rem]" : ""}`}>{v || <span className="italic text-[var(--faint)]">—</span>}</dd>
    </div>
  );
}
