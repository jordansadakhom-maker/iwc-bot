"use client";

import { useMemo, useState } from "react";
import { IdCard, UserPlus, Pencil, Trash2, X, ScanLine, Send, Droplet, TriangleAlert } from "lucide-react";
import { lireCartePhoto, ajouterPatient, majPatient, supprimerPatient } from "@/app/actions";
import type { Patient } from "@/lib/data";
import { Bloc, Vide } from "./ui";
import { useAction, useConfirm, useToast } from "./ux";
import { PhotoDrop } from "./photo-drop";

const GROUPES = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
type Champs = { prenom: string; nom: string; dateNaissance: string; sexe: string; nationalite: string; numero: string; telegramme: string; groupeSanguin: string; allergies: string; notes: string };
const VIDE: Champs = { prenom: "", nom: "", dateNaissance: "", sexe: "", nationalite: "", numero: "", telegramme: "", groupeSanguin: "", allergies: "", notes: "" };
const depuis = (p: Patient): Champs => ({ prenom: p.prenom || "", nom: p.nom || "", dateNaissance: p.dateNaissance || "", sexe: p.sexe || "", nationalite: p.nationalite || "", numero: p.numero || "", telegramme: p.telegramme || "", groupeSanguin: p.groupeSanguin || "", allergies: p.allergies || "", notes: p.notes || "" });

function Formulaire({ init, submitLabel, onSubmit, onCancel, busy }: { init: Champs; submitLabel: string; onSubmit: (c: Champs) => void; onCancel: () => void; busy: boolean }) {
  const [f, setF] = useState<Champs>(init);
  const set = (k: keyof Champs, v: string) => setF((s) => ({ ...s, [k]: v }));
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      <label className="text-[0.72rem] text-[var(--faint)]">Prénom<input className="inp mt-0.5" value={f.prenom} onChange={(e) => set("prenom", e.target.value)} /></label>
      <label className="text-[0.72rem] text-[var(--faint)]">Nom<input className="inp mt-0.5" value={f.nom} onChange={(e) => set("nom", e.target.value)} /></label>
      <label className="text-[0.72rem] text-[var(--faint)]">Date de naissance<input className="inp mt-0.5" value={f.dateNaissance} onChange={(e) => set("dateNaissance", e.target.value)} placeholder="jj/mm/aaaa" /></label>
      <label className="text-[0.72rem] text-[var(--faint)]">Sexe<input className="inp mt-0.5" value={f.sexe} onChange={(e) => set("sexe", e.target.value)} placeholder="H / F" /></label>
      <label className="text-[0.72rem] text-[var(--faint)]">Nationalité<input className="inp mt-0.5" value={f.nationalite} onChange={(e) => set("nationalite", e.target.value)} /></label>
      <label className="text-[0.72rem] text-[var(--faint)]">N° de carte d&apos;identité<input className="inp mt-0.5" value={f.numero} onChange={(e) => set("numero", e.target.value)} /></label>
      <label className="text-[0.72rem] text-[var(--faint)]">N° télégramme<input className="inp mt-0.5" value={f.telegramme} onChange={(e) => set("telegramme", e.target.value)} /></label>
      <label className="text-[0.72rem] text-[var(--faint)]">Groupe sanguin<input className="inp mt-0.5" list="disp-groupes" value={f.groupeSanguin} onChange={(e) => set("groupeSanguin", e.target.value)} placeholder="A+, O-…" /></label>
      <label className="text-[0.72rem] text-[var(--faint)]">&nbsp;</label>
      <label className="text-[0.72rem] text-[var(--faint)] sm:col-span-3">Allergies<input className="inp mt-0.5" value={f.allergies} onChange={(e) => set("allergies", e.target.value)} placeholder="pénicilline, latex…" /></label>
      <label className="text-[0.72rem] text-[var(--faint)] sm:col-span-3">Antécédents / notes médicales<textarea className="inp mt-0.5" rows={2} value={f.notes} onChange={(e) => set("notes", e.target.value)} /></label>
      <div className="flex gap-2 sm:col-span-3">
        <button className="btn-accent btn" disabled={busy} onClick={() => onSubmit(f)}>{busy ? <span className="spin" /> : null} {submitLabel}</button>
        <button className="btn" onClick={onCancel}><X className="h-4 w-4" /> Annuler</button>
      </div>
    </div>
  );
}

function nomComplet(p: Patient) { return [p.prenom, p.nom].filter(Boolean).join(" ") || "Sans nom"; }

function Fiche({ p }: { p: Patient }) {
  const { run, isPending } = useAction();
  const confirm = useConfirm();
  const [edit, setEdit] = useState(false);

  if (edit) return (
    <li className="border-b border-[var(--line)]/60 px-4 py-3 last:border-0">
      <Formulaire init={depuis(p)} submitLabel="Enregistrer" busy={isPending} onCancel={() => setEdit(false)} onSubmit={(c) => run(() => majPatient(p.id, c), "Fiche mise à jour.").then((ok) => { if (ok) setEdit(false); })} />
    </li>
  );

  return (
    <li className="rise flex flex-wrap items-start gap-x-3 gap-y-1 border-b border-[var(--line)]/60 px-4 py-3 last:border-0">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-display text-[1.05rem]">{nomComplet(p)}</span>
          {p.sexe ? <span className="rounded-full border border-[var(--line)] px-2 py-0.5 text-[0.68rem] text-[var(--muted)]">{p.sexe}</span> : null}
          {p.groupeSanguin ? <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.68rem] font-bold" style={{ background: "color-mix(in srgb, var(--oxblood) 12%, var(--card))", color: "var(--oxblood)" }}><Droplet className="h-3 w-3" />{p.groupeSanguin}</span> : null}
        </div>
        <div className="mt-0.5 flex flex-wrap gap-x-4 text-[0.8rem] text-[var(--muted)]">
          {p.dateNaissance ? <span>Né(e) le {p.dateNaissance}</span> : null}
          {p.nationalite ? <span>{p.nationalite}</span> : null}
          {p.numero ? <span className="tabnum">Carte n° {p.numero}</span> : null}
          {p.telegramme ? <span className="inline-flex items-center gap-1 text-[var(--accent)]"><Send className="h-3 w-3" />{p.telegramme}</span> : null}
        </div>
        {p.allergies ? <div className="mt-1 inline-flex items-center gap-1 text-[0.82rem] font-medium" style={{ color: "var(--oxblood)" }}><TriangleAlert className="h-3.5 w-3.5" /> Allergies : {p.allergies}</div> : null}
        {p.notes ? <div className="mt-0.5 text-[0.82rem] italic text-[var(--faint)]">{p.notes}</div> : null}
      </div>
      <div className="flex gap-1">
        <button className="btn !px-2 !py-1" onClick={() => setEdit(true)} title="Modifier"><Pencil className="h-3.5 w-3.5" /></button>
        <button className="btn !px-2 !py-1" title="Supprimer" style={{ color: "var(--oxblood)" }} onClick={async () => { if (await confirm(`Supprimer la fiche de ${nomComplet(p)} ?`, { danger: true, ok: "Supprimer" })) run(() => supprimerPatient(p.id), "Fiche supprimée."); }}><Trash2 className="h-3.5 w-3.5" /></button>
      </div>
    </li>
  );
}

export function Patients({ patients }: { patients: Patient[] }) {
  const { run, isPending } = useAction();
  const toast = useToast();
  const [q, setQ] = useState("");
  const [form, setForm] = useState<Champs | null>(null);
  const [scan, setScan] = useState(false);
  const [scanBusy, setScanBusy] = useState(false);
  const [formKey, setFormKey] = useState(0);

  const filtre = q.trim().toLowerCase();
  const liste = useMemo(() => filtre ? patients.filter((p) => [p.prenom, p.nom, p.numero, p.nationalite].filter(Boolean).join(" ").toLowerCase().includes(filtre)) : patients, [patients, filtre]);

  function ouvrirForm(init: Champs) { setForm(init); setFormKey((k) => k + 1); setScan(false); }
  async function lireCarte(base64: string, mediaType: string) {
    setScanBusy(true);
    const r = await lireCartePhoto(base64, mediaType);
    setScanBusy(false);
    if (!r.ok || !r.fiche) { toast(r.error || "Lecture impossible.", "err"); return; }
    toast("Carte lue — vérifie puis enregistre.", "ok");
    ouvrirForm({ ...VIDE, ...r.fiche });
  }

  return (
    <div className="flex flex-col gap-5">
      <datalist id="disp-groupes">{GROUPES.map((g) => <option key={g} value={g} />)}</datalist>

      <div className="flex flex-wrap items-center gap-3">
        <input className="inp" style={{ maxWidth: 260 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un patient…" />
        <div className="ml-auto flex gap-2">
          <button className="btn" onClick={() => { setScan((v) => !v); setForm(null); }}><ScanLine className="h-4 w-4" /> Scanner une carte d&apos;identité</button>
          <button className="btn-accent btn" onClick={() => ouvrirForm(VIDE)}><UserPlus className="h-4 w-4" /> Nouvelle fiche</button>
        </div>
      </div>

      {scan ? (
        <div className="rounded-[8px] border border-[var(--line)] bg-[var(--card)] p-4">
          <div className="mb-3 flex items-center gap-2">
            <IdCard className="h-4 w-4 text-[var(--muted)]" />
            <h2 className="font-display text-[1.05rem]">Scanner une carte d&apos;identité</h2>
            <button className="btn !px-2 !py-1 ml-auto" onClick={() => setScan(false)}><X className="h-4 w-4" /></button>
          </div>
          <PhotoDrop onImage={lireCarte} busy={scanBusy} hint="ou cliquer pour choisir — l'IA lit nom, prénom, date de naissance, nationalité, n° de carte" />
        </div>
      ) : null}

      {form ? (
        <div className="rounded-[8px] border border-[var(--line)] bg-[var(--card)] p-4">
          <h2 className="mb-3 flex items-center gap-2 font-display text-[1.05rem]"><IdCard className="h-4 w-4 text-[var(--muted)]" /> Fiche patient</h2>
          <Formulaire key={formKey} init={form} submitLabel="Créer la fiche" busy={isPending} onCancel={() => setForm(null)} onSubmit={(c) => run(() => ajouterPatient(c), "Fiche créée.").then((ok) => { if (ok) setForm(null); })} />
        </div>
      ) : null}

      {patients.length === 0 ? (
        <Bloc titre="Patients" icon={<IdCard className="h-4 w-4 text-[var(--muted)]" />}><Vide>Aucune fiche patient. Scanne une carte d&apos;identité ou crée une fiche à la main.</Vide></Bloc>
      ) : (
        <Bloc titre="Fiches patients" icon={<IdCard className="h-4 w-4 text-[var(--muted)]" />} compteur={liste.length}>
          {liste.length === 0 ? <Vide>Aucun patient ne correspond à ta recherche.</Vide> : <ul>{liste.map((p) => <Fiche key={p.id} p={p} />)}</ul>}
        </Bloc>
      )}
    </div>
  );
}
