"use client";

import { useState } from "react";
import { Send, CheckCircle2, Loader2 } from "lucide-react";
import { envoyerTelegrammeWeb } from "./actions";

const inputCls =
  "w-full rounded-xl border border-border bg-surface-2 px-3.5 py-2.5 text-[0.9rem] text-ink outline-none placeholder:text-faint focus:border-[color-mix(in_srgb,var(--accent)_55%,var(--border))]";

export function TelegrammeForm() {
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [form, setForm] = useState({ nom: "", contact: "", message: "", website: "" });
  const set = <K extends keyof typeof form>(k: K, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setLoading(true); setErr(null);
    try {
      const r = await envoyerTelegrammeWeb(form);
      if (r.ok) setDone(true); else setErr(r.error || "Une erreur est survenue.");
    } catch { setErr("Envoi impossible pour le moment. Réessaie dans un instant."); }
    finally { setLoading(false); }
  }

  if (done) {
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <span className="grid h-14 w-14 place-items-center rounded-2xl" style={{ color: "var(--good)", background: "color-mix(in srgb,var(--good) 16%,transparent)" }}><CheckCircle2 className="h-7 w-7" strokeWidth={1.8} /></span>
        <h2 className="font-display text-xl">Télégramme envoyé&nbsp;!</h2>
        <p className="max-w-sm text-[0.88rem] leading-relaxed text-muted">Merci <b>{form.nom}</b>. Ton télégramme est parti vers la maison. Un membre te répondra{form.contact ? <> via <b>{form.contact}</b></> : ""} dès que possible.</p>
        <button onClick={() => { setDone(false); setForm({ nom: "", contact: "", message: "", website: "" }); }} className="mt-2 rounded-xl border border-border bg-surface px-4 py-2 text-[0.85rem] text-muted hover:text-ink">Envoyer un autre télégramme</button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3.5">
      <div>
        <label className="mb-1.5 block text-[0.76rem] font-semibold uppercase tracking-[0.06em] text-muted">Ton nom *</label>
        <input className={inputCls} required value={form.nom} onChange={(e) => set("nom", e.target.value)} placeholder="Nom &amp; prénom du personnage" />
      </div>
      <div>
        <label className="mb-1.5 block text-[0.76rem] font-semibold uppercase tracking-[0.06em] text-muted">Comment te répondre&nbsp;? (optionnel)</label>
        <input className={inputCls} value={form.contact} onChange={(e) => set("contact", e.target.value)} placeholder="Pseudo Discord, ou autre moyen" />
      </div>
      <div>
        <label className="mb-1.5 block text-[0.76rem] font-semibold uppercase tracking-[0.06em] text-muted">Ton télégramme *</label>
        <textarea className={`${inputCls} min-h-[130px] resize-y`} required value={form.message} onChange={(e) => set("message", e.target.value)} placeholder="Écris ton message à la maison…" />
      </div>
      <input type="text" tabIndex={-1} autoComplete="off" aria-hidden className="hidden" value={form.website} onChange={(e) => set("website", e.target.value)} />
      {err ? <p className="text-[0.82rem] text-crit">{err}</p> : null}
      <button type="submit" disabled={loading} className="mt-1 flex w-full items-center justify-center gap-2.5 rounded-xl px-4 py-3 text-[0.95rem] font-semibold text-black/85 transition hover:brightness-105 disabled:opacity-60" style={{ background: "linear-gradient(135deg,var(--accent),color-mix(in srgb,var(--accent) 55%,#000))" }}>
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}{loading ? "Envoi…" : "Envoyer le télégramme"}
      </button>
      <p className="text-center text-[0.72rem] text-faint">Réponse via le moyen de contact indiqué. Aucune connexion nécessaire.</p>
    </form>
  );
}
