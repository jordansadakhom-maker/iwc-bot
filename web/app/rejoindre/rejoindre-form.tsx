"use client";

import { useState } from "react";
import { UserPlus, CheckCircle2, Loader2 } from "lucide-react";
import { envoyerCandidature } from "./actions";

const MOYENS = ["Discord", "Télégramme", "Autre"];
const inputCls =
  "w-full rounded-xl border border-border bg-surface-2 px-3.5 py-2.5 text-[0.9rem] text-ink outline-none placeholder:text-faint focus:border-[color-mix(in_srgb,var(--accent)_55%,var(--border))]";
const labelCls = "mb-1.5 block text-[0.76rem] font-semibold uppercase tracking-[0.06em] text-muted";

export function RejoindreForm() {
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [form, setForm] = useState({ nomRP: "", age: "", moyen: MOYENS[0], contact: "", experience: "", motivation: "", disponibilites: "", website: "" });
  const set = <K extends keyof typeof form>(k: K, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setLoading(true); setErr(null);
    try {
      const r = await envoyerCandidature(form);
      if (r.ok) setDone(true); else setErr(r.error || "Une erreur est survenue.");
    } catch { setErr("Envoi impossible pour le moment. Réessaie dans un instant."); }
    finally { setLoading(false); }
  }

  if (done) {
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <span className="grid h-14 w-14 place-items-center rounded-2xl" style={{ color: "var(--good)", background: "color-mix(in srgb,var(--good) 16%,transparent)" }}><CheckCircle2 className="h-7 w-7" strokeWidth={1.8} /></span>
        <h2 className="font-display text-xl">Candidature envoyée&nbsp;!</h2>
        <p className="max-w-sm text-[0.88rem] leading-relaxed text-muted">Merci <b>{form.nomRP}</b>. Ta candidature est arrivée à la maison. Un membre te recontactera via <b>{form.moyen}</b> ({form.contact}) pour la suite.</p>
        <button onClick={() => { setDone(false); setForm({ nomRP: "", age: "", moyen: MOYENS[0], contact: "", experience: "", motivation: "", disponibilites: "", website: "" }); }} className="mt-2 rounded-xl border border-border bg-surface px-4 py-2 text-[0.85rem] text-muted hover:text-ink">Envoyer une autre candidature</button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3.5">
      <div className="grid gap-3.5 sm:grid-cols-[1fr_100px]">
        <div><label className={labelCls}>Ton nom RP *</label><input className={inputCls} required value={form.nomRP} onChange={(e) => set("nomRP", e.target.value)} placeholder="Nom & prénom du personnage" /></div>
        <div><label className={labelCls}>Âge</label><input className={inputCls} value={form.age} onChange={(e) => set("age", e.target.value)} placeholder="Ex. 27" /></div>
      </div>

      <div>
        <label className={labelCls}>Comment te contacter&nbsp;? *</label>
        <div className="grid gap-2 sm:grid-cols-[130px_1fr]">
          <select className={inputCls} value={form.moyen} onChange={(e) => set("moyen", e.target.value)}>{MOYENS.map((m) => <option key={m} value={m}>{m}</option>)}</select>
          <input className={inputCls} required value={form.contact} onChange={(e) => set("contact", e.target.value)} placeholder={form.moyen === "Télégramme" ? "N° ou nom de télégramme" : form.moyen === "Discord" ? "Ton pseudo Discord" : "Comment te joindre"} />
        </div>
      </div>

      <div><label className={labelCls}>Ton expérience</label><textarea className={`${inputCls} min-h-[80px] resize-y`} value={form.experience} onChange={(e) => set("experience", e.target.value)} placeholder="Maniement des armes, sécurité, escorte, médecine, précédentes compagnies…" /></div>

      <div><label className={labelCls}>Pourquoi nous rejoindre&nbsp;? *</label><textarea className={`${inputCls} min-h-[100px] resize-y`} required value={form.motivation} onChange={(e) => set("motivation", e.target.value)} placeholder="Parle-nous de toi et de ce qui te motive à rejoindre la Iron Wolf Company…" /></div>

      <div><label className={labelCls}>Tes disponibilités</label><input className={inputCls} value={form.disponibilites} onChange={(e) => set("disponibilites", e.target.value)} placeholder="Ex. soirs de semaine, week-ends…" /></div>

      <input type="text" tabIndex={-1} autoComplete="off" aria-hidden className="hidden" value={form.website} onChange={(e) => set("website", e.target.value)} />
      {err ? <p className="text-[0.82rem] text-crit">{err}</p> : null}

      <button type="submit" disabled={loading} className="mt-1 flex w-full items-center justify-center gap-2.5 rounded-xl px-4 py-3 text-[0.95rem] font-semibold text-black/85 transition hover:brightness-105 disabled:opacity-60" style={{ background: "linear-gradient(135deg,var(--accent),color-mix(in srgb,var(--accent) 55%,#000))" }}>
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}{loading ? "Envoi…" : "Envoyer ma candidature"}
      </button>
      <p className="text-center text-[0.72rem] text-faint">Réponse via le moyen de contact indiqué. Aucune connexion nécessaire.</p>
    </form>
  );
}
