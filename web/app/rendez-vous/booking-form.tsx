"use client";

import { useState } from "react";
import { CalendarCheck, CheckCircle2, Loader2 } from "lucide-react";
import { soumettreRdv } from "./actions";

const PRESTATIONS = [
  "Sécurité / Garde du corps",
  "Escorte de convoi",
  "Protection d'événement",
  "Achat / Vente d'arme",
  "Cours de tir / Formation",
  "Chasse de prime / Traque",
  "Récupération / Recouvrement",
  "Enquête / Renseignement",
  "Soin médical",
  "🐺 Rejoindre la compagnie (recrutement)",
  "Autre demande",
];

// Durée estimée — sert à adapter les tarifs au taux horaire.
const DUREES = [
  "≈ 30 min",
  "≈ 1 heure",
  "≈ 1 h 30",
  "≈ 2 heures",
  "≈ 3 heures",
  "Demi-journée",
  "Journée complète",
  "Plusieurs jours",
  "À définir ensemble",
];

// Moyen de contact préféré.
const MOYENS = ["Discord", "Télégramme", "Autre"];

const inputCls =
  "w-full rounded-xl border border-border bg-surface-2 px-3.5 py-2.5 text-[0.9rem] text-ink outline-none placeholder:text-faint focus:border-[color-mix(in_srgb,var(--accent)_55%,var(--border))]";

export function BookingForm() {
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [form, setForm] = useState({
    nomRP: "", prestation: PRESTATIONS[0], creneau: "", duree: DUREES[1], lieu: "", moyen: MOYENS[0], contact: "", message: "", website: "",
  });

  function set<K extends keyof typeof form>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErr(null);
    try {
      const contactFinal = `${form.moyen} : ${form.contact.trim()}`;
      const res = await soumettreRdv({ ...form, contact: contactFinal });
      if (res.ok) setDone(true);
      else setErr(res.error || "Une erreur est survenue.");
    } catch {
      setErr("Envoi impossible pour le moment. Réessaie dans un instant.");
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <span className="grid h-14 w-14 place-items-center rounded-2xl text-good" style={{ background: "color-mix(in srgb,var(--good) 16%,transparent)" }}>
          <CheckCircle2 className="h-7 w-7" strokeWidth={1.8} />
        </span>
        <h2 className="font-display text-xl">Demande envoyée&nbsp;!</h2>
        <p className="max-w-sm text-[0.88rem] leading-relaxed text-muted">
          Merci <b>{form.nomRP}</b>. Ta demande de rendez-vous a bien été transmise à la maison.
          Un membre te recontactera via <b>{form.moyen}</b> ({form.contact}) dès que possible.
        </p>
        <button
          onClick={() => { setDone(false); setForm({ nomRP: "", prestation: PRESTATIONS[0], creneau: "", duree: DUREES[1], lieu: "", moyen: MOYENS[0], contact: "", message: "", website: "" }); }}
          className="mt-2 rounded-xl border border-border bg-surface px-4 py-2 text-[0.85rem] text-muted hover:text-ink"
        >
          Faire une autre demande
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3.5">
      <div>
        <label className="mb-1.5 block text-[0.76rem] font-semibold uppercase tracking-[0.06em] text-muted">Ton nom *</label>
        <input className={inputCls} required value={form.nomRP} onChange={(e) => set("nomRP", e.target.value)} placeholder="Nom &amp; prénom du personnage" />
      </div>

      <div>
        <label className="mb-1.5 block text-[0.76rem] font-semibold uppercase tracking-[0.06em] text-muted">Prestation souhaitée</label>
        <select className={inputCls} value={form.prestation} onChange={(e) => set("prestation", e.target.value)}>
          {PRESTATIONS.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>

      <div className="grid gap-3.5 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-[0.76rem] font-semibold uppercase tracking-[0.06em] text-muted">Créneau souhaité</label>
          <input className={inputCls} value={form.creneau} onChange={(e) => set("creneau", e.target.value)} placeholder="Ex. samedi soir, en journée…" />
        </div>
        <div>
          <label className="mb-1.5 block text-[0.76rem] font-semibold uppercase tracking-[0.06em] text-muted">Durée estimée</label>
          <select className={inputCls} value={form.duree} onChange={(e) => set("duree", e.target.value)}>
            {DUREES.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-[0.76rem] font-semibold uppercase tracking-[0.06em] text-muted">Lieu (facultatif)</label>
        <input className={inputCls} value={form.lieu} onChange={(e) => set("lieu", e.target.value)} placeholder="Ex. Valentine, Rhodes…" />
      </div>

      <div>
        <label className="mb-1.5 block text-[0.76rem] font-semibold uppercase tracking-[0.06em] text-muted">Comment te contacter&nbsp;? *</label>
        <div className="grid gap-2 sm:grid-cols-[130px_1fr]">
          <select className={inputCls} value={form.moyen} onChange={(e) => set("moyen", e.target.value)}>
            {MOYENS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <input className={inputCls} required value={form.contact} onChange={(e) => set("contact", e.target.value)} placeholder={form.moyen === "Télégramme" ? "N° ou nom de télégramme" : form.moyen === "Discord" ? "Ton pseudo Discord" : "Comment te joindre"} />
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-[0.76rem] font-semibold uppercase tracking-[0.06em] text-muted">Ta demande</label>
        <textarea className={`${inputCls} min-h-[110px] resize-y`} value={form.message} onChange={(e) => set("message", e.target.value)} placeholder="Décris ce dont tu as besoin…" />
      </div>

      {/* Honeypot anti-spam — caché aux humains */}
      <input
        type="text" tabIndex={-1} autoComplete="off" aria-hidden
        className="hidden" value={form.website} onChange={(e) => set("website", e.target.value)}
      />

      {err ? <p className="text-[0.82rem] text-crit">{err}</p> : null}

      <button
        type="submit" disabled={loading}
        className="mt-1 flex w-full items-center justify-center gap-2.5 rounded-xl px-4 py-3 text-[0.95rem] font-semibold text-black/85 transition hover:brightness-105 disabled:opacity-60"
        style={{ background: "linear-gradient(135deg,var(--accent),color-mix(in srgb,var(--accent) 55%,#000))" }}
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarCheck className="h-4 w-4" />}
        {loading ? "Envoi…" : "Envoyer ma demande"}
      </button>

      <p className="text-center text-[0.72rem] text-faint">Réponse via le moyen de contact indiqué. Aucune connexion nécessaire.</p>
    </form>
  );
}
