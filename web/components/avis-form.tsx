"use client";

import { useEffect, useRef, useState } from "react";
import { Star, Loader2, Check } from "lucide-react";
import { soumettreAvis } from "@/app/avis/actions";
import { inputCls } from "@/components/edit-ui";

// Formulaire public de notation (1 à 5 étoiles + commentaire libre).
export function AvisForm({ rdvId, nom, prestation }: { rdvId: string; nom: string | null; prestation: string | null }) {
  const [note, setNote] = useState(0);
  const [survol, setSurvol] = useState(0);
  const [commentaire, setCommentaire] = useState("");
  const [website, setWebsite] = useState(""); // honeypot
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const t0 = useRef(0);
  useEffect(() => { t0.current = Date.now(); }, []);

  async function envoyer() {
    if (note < 1) { setErr("Choisis une note de 1 à 5 étoiles."); return; }
    setErr(null); setBusy(true);
    const r = await soumettreAvis({ rdvId, note, commentaire, website, ms: Date.now() - t0.current });
    setBusy(false);
    if (!r.ok) { setErr(r.error || "Échec — réessaie."); return; }
    setDone(true);
  }

  if (done) {
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <span className="grid h-12 w-12 place-items-center rounded-full" style={{ background: "color-mix(in srgb,var(--good) 18%,transparent)", color: "var(--good)" }}><Check className="h-6 w-6" /></span>
        <p className="text-[0.92rem] font-semibold">Merci pour ton retour&nbsp;!</p>
        <p className="max-w-[320px] text-[0.82rem] text-muted">Ton avis a bien été transmis à la Iron Wolf Company.</p>
      </div>
    );
  }

  const affiche = survol || note;
  return (
    <div className="flex flex-col gap-4">
      <p className="text-center text-[0.84rem] text-muted">
        {nom ? <><b className="text-ink">{nom}</b>, comment</> : "Comment"} s&apos;est passée ta prestation{prestation ? <> «&nbsp;{prestation}&nbsp;»</> : null}&nbsp;?
      </p>

      <div className="flex justify-center gap-1.5" onMouseLeave={() => setSurvol(0)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" onClick={() => setNote(n)} onMouseEnter={() => setSurvol(n)} aria-label={`${n} étoile${n > 1 ? "s" : ""}`} className="p-1 transition hover:scale-110">
            <Star className="h-8 w-8" strokeWidth={1.6} style={{ color: n <= affiche ? "var(--accent)" : "var(--faint)", fill: n <= affiche ? "var(--accent)" : "transparent" }} />
          </button>
        ))}
      </div>

      <textarea className={inputCls + " min-h-[90px] resize-y"} value={commentaire} onChange={(e) => setCommentaire(e.target.value)} placeholder="Un mot sur ta prestation ? (facultatif)" maxLength={1000} />

      {/* Honeypot anti-robot (masqué) */}
      <input type="text" value={website} onChange={(e) => setWebsite(e.target.value)} tabIndex={-1} autoComplete="off" aria-hidden className="hidden" />

      {err ? <p className="text-center text-[0.82rem]" style={{ color: "var(--oxblood)" }}>{err}</p> : null}

      <button onClick={envoyer} disabled={busy} className="inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-[0.88rem] font-semibold text-black/85 disabled:opacity-60" style={{ background: "var(--accent)" }}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Star className="h-4 w-4" />} Envoyer mon avis
      </button>
    </div>
  );
}
