"use client";

import { useState } from "react";
import { FileText, Send, Printer, Eraser, Copy, Check, ScrollText, Wand2 } from "lucide-react";
import { envoyerCertificat } from "@/app/actions";
import type { Certificat } from "@/lib/data";
import { useMoi, Bloc, Vide } from "./ui";
import { useAction, useToast } from "./ux";

type Modele = { diagnostic?: string; prescription?: string; observations?: string };
const TYPES = ["Certificat médical", "Certificat d'aptitude", "Certificat de repos", "Constat de blessure", "Certificat de décès"];
const MODELES: Record<string, Modele> = {
  "Certificat d'aptitude": { diagnostic: "Examen clinique complet — aucune contre-indication constatée.", prescription: "Aucune.", observations: "Apte au service et au port d'arme." },
  "Certificat de repos": { diagnostic: "État nécessitant du repos.", prescription: "Repos prescrit — ___ jours. Réévaluation ensuite.", observations: "Arrêt de travail recommandé sur la période." },
  "Constat de blessure": { diagnostic: "Blessure constatée : ___ (localisation, nature).", prescription: "Nettoyage, désinfection, suture/pansement, tonique.", observations: "Gravité : ___. Suivi conseillé sous ___ jours." },
  "Certificat de décès": { diagnostic: "Décès constaté le ___ à ___ h.", prescription: "—", observations: "Cause présumée : ___. Corps remis à ___." },
  "Certificat médical": {},
};
const vide = { type: "Certificat médical", patient: "", praticien: "", dateActe: "", diagnostic: "", prescription: "", observations: "" };

function aujourdhui() { try { return new Date().toISOString().slice(0, 10); } catch { return ""; } }
function joli(d: string) { if (!d) return "—"; const [y, m, j] = d.split("-"); return `${j}/${m}/${y}`; }

export function Certificats({ archive, patients = [], initialPatient = "" }: { archive: Certificat[]; patients?: string[]; initialPatient?: string }) {
  const [moi] = useMoi();
  const { run, isPending } = useAction();
  const toast = useToast();
  const [f, setF] = useState({ ...vide, patient: initialPatient, praticien: "", dateActe: aujourdhui() });
  const [copie, setCopie] = useState(false);

  const praticien = f.praticien || moi;
  const set = (k: keyof typeof f, v: string) => setF((s) => ({ ...s, [k]: v }));

  function choisirType(type: string) {
    const m = MODELES[type] || {};
    // Ne remplit que les champs vides pour ne pas écraser ce qui est déjà écrit.
    setF((s) => ({ ...s, type, diagnostic: s.diagnostic || m.diagnostic || "", prescription: s.prescription || m.prescription || "", observations: s.observations || m.observations || "" }));
  }
  function insererModele() {
    const m = MODELES[f.type] || {};
    setF((s) => ({ ...s, diagnostic: m.diagnostic || "", prescription: m.prescription || "", observations: m.observations || "" }));
    toast("Modèle inséré.", "info");
  }

  function texte() {
    const L = (t: string, v: string) => (v ? `${t} : ${v}\n` : "");
    return `${f.type} — Dispensaire de Saint-Denis\n\n` + L("Patient", f.patient) + L("Praticien", praticien) + L("Date de l'acte", joli(f.dateActe)) + L("Diagnostic", f.diagnostic) + L("Prescription / soins", f.prescription) + L("Observations", f.observations);
  }
  function envoyer() {
    if (f.patient.trim().length < 2) { toast("Indique le nom du patient.", "err"); return; }
    run(() => envoyerCertificat({ ...f, praticien }), "Certificat enregistré et déposé sur Discord.");
  }
  async function copier() { try { await navigator.clipboard.writeText(texte()); setCopie(true); setTimeout(() => setCopie(false), 1500); toast("Texte copié.", "info"); } catch {} }

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-5 lg:grid-cols-2">
        {/* Formulaire */}
        <section className="no-print rounded-[8px] border border-[var(--line)] bg-[var(--card)] p-4">
          <h2 className="mb-1 flex items-center gap-2 font-display text-[1.05rem]"><FileText className="h-4 w-4 text-[var(--muted)]" /> Rédiger un certificat</h2>
          <p className="mb-3 text-[0.82rem] text-[var(--muted)]">Choisis un type : les champs se pré-remplissent. Ajuste, dépose sur Discord, puis efface pour le suivant.</p>
          <div className="grid gap-2">
            <div className="flex flex-wrap gap-1.5">
              {TYPES.map((t) => <button key={t} className={`chip ${f.type === t ? "on" : ""}`} onClick={() => choisirType(t)}>{t.replace("Certificat ", "").replace("Constat ", "Constat ")}</button>)}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-[0.72rem] text-[var(--faint)]">Patient<input className="inp mt-0.5" list="disp-patients" value={f.patient} onChange={(e) => set("patient", e.target.value)} placeholder="Prénom Nom" /><datalist id="disp-patients">{patients.map((n) => <option key={n} value={n} />)}</datalist></label>
              <label className="text-[0.72rem] text-[var(--faint)]">Date de l&apos;acte<input className="inp mt-0.5" type="date" value={f.dateActe} onChange={(e) => set("dateActe", e.target.value)} /></label>
            </div>
            <label className="text-[0.72rem] text-[var(--faint)]">Praticien<input className="inp mt-0.5" value={f.praticien} onChange={(e) => set("praticien", e.target.value)} placeholder={moi || "Nom du praticien"} /></label>
            <label className="text-[0.72rem] text-[var(--faint)]">Diagnostic<textarea className="inp mt-0.5" rows={2} value={f.diagnostic} onChange={(e) => set("diagnostic", e.target.value)} /></label>
            <label className="text-[0.72rem] text-[var(--faint)]">Prescription / soins<textarea className="inp mt-0.5" rows={2} value={f.prescription} onChange={(e) => set("prescription", e.target.value)} /></label>
            <label className="text-[0.72rem] text-[var(--faint)]">Observations<textarea className="inp mt-0.5" rows={2} value={f.observations} onChange={(e) => set("observations", e.target.value)} /></label>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button className="btn-accent btn" onClick={envoyer} disabled={isPending}>{isPending ? <span className="spin" /> : <Send className="h-4 w-4" />} Enregistrer &amp; envoyer</button>
            <button className="btn" onClick={insererModele}><Wand2 className="h-4 w-4" /> Modèle</button>
            <button className="btn" onClick={() => window.print()}><Printer className="h-4 w-4" /> Imprimer</button>
            <button className="btn" onClick={copier}>{copie ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copie ? "Copié" : "Copier"}</button>
            <button className="btn" onClick={() => { setF({ ...vide, praticien: "", dateActe: aujourdhui() }); toast("Formulaire effacé.", "info"); }} style={{ color: "var(--oxblood)" }}><Eraser className="h-4 w-4" /> Effacer</button>
          </div>
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

      {/* Archive des certificats émis */}
      <div className="no-print">
        <Bloc titre="Certificats émis" icon={<ScrollText className="h-4 w-4 text-[var(--muted)]" />} compteur={archive.length}>
          {archive.length === 0 ? <Vide>Aucun certificat archivé pour le moment.</Vide> : (
            <ul className="max-h-[320px] overflow-auto">
              {archive.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-x-3 border-b border-[var(--line)]/60 px-4 py-2 text-[0.85rem] last:border-0">
                  <span className="font-medium">{c.patient}</span>
                  {c.type ? <span className="rounded-full border border-[var(--line)] px-2 py-0.5 text-[0.68rem] text-[var(--accent)]">{c.type}</span> : null}
                  {c.diagnostic ? <span className="min-w-0 flex-1 truncate text-[var(--muted)]">{c.diagnostic}</span> : <span className="flex-1" />}
                  <span className="text-[0.76rem] text-[var(--faint)]">{c.praticien || "—"}</span>
                  <span className="tabnum text-[0.74rem] text-[var(--faint)]">{c.dateActe ? joli(c.dateActe) : ""}</span>
                </li>
              ))}
            </ul>
          )}
        </Bloc>
      </div>
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
