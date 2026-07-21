"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, Square, Loader2, Send, Radio, Trash2, CheckCircle2 } from "lucide-react";
import { Card, CardHeader } from "@/components/ui";
import { Champ, Picker, inputCls } from "@/components/edit-ui";
import { envoyerNoteVocale } from "@/app/(app)/notes-vocales/actions";

// Reconnaissance vocale continue (API Web Speech, français). Aucun serveur : le
// navigateur transcrit ce que capte le micro/casque, on accumule le texte, puis
// on l'envoie au réseau où l'IA le transforme en rapport de terrain immersif.
type SpeechAlt = { transcript: string };
type SpeechResult = ArrayLike<SpeechAlt> & { isFinal: boolean };
type SpeechEvent = { resultIndex: number; results: ArrayLike<SpeechResult> };
type SpeechRec = {
  lang: string; continuous: boolean; interimResults: boolean;
  start: () => void; stop: () => void;
  onresult: ((e: SpeechEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
};
type SRCtor = new () => SpeechRec;
function getCtor(): SRCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: SRCtor; webkitSpeechRecognition?: SRCtor };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

const PRIORITES = [
  { key: "normale", label: "Normale" },
  { key: "importante", label: "Importante", tone: "var(--warn)" },
  { key: "urgente", label: "Urgente", tone: "var(--oxblood)" },
];

export function NotesVocales() {
  const [support, setSupport] = useState(false);
  const [recording, setRecording] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interim, setInterim] = useState("");
  const [cible, setCible] = useState("");
  const [lieu, setLieu] = useState("");
  const [priorite, setPriorite] = useState("normale");
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<{ t: "ok" | "bad"; m: string } | null>(null);

  const recRef = useRef<SpeechRec | null>(null);
  const recordingRef = useRef(false);

  useEffect(() => { setSupport(!!getCtor()); }, []);
  useEffect(() => () => { recordingRef.current = false; try { recRef.current?.stop(); } catch { /* ignore */ } }, []);

  function demarrer() {
    const Ctor = getCtor();
    if (!Ctor) return;
    setFlash(null);
    const rec = new Ctor();
    rec.lang = "fr-FR"; rec.continuous = true; rec.interimResults = true;
    rec.onresult = (e) => {
      let live = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        const t = r[0]?.transcript || "";
        if (r.isFinal) setTranscript((prev) => (prev ? prev.trim() + " " : "") + t.trim());
        else live += t;
      }
      setInterim(live);
    };
    rec.onerror = (e) => {
      if (e?.error === "not-allowed" || e?.error === "service-not-allowed") {
        recordingRef.current = false; setRecording(false);
        setFlash({ t: "bad", m: "Micro refusé — autorise l'accès au microphone dans le navigateur." });
      }
    };
    // Chrome coupe la reconnaissance après un silence : on relance tant qu'on enregistre.
    rec.onend = () => { setInterim(""); if (recordingRef.current) { try { rec.start(); } catch { /* ignore */ } } else setRecording(false); };
    recRef.current = rec;
    recordingRef.current = true;
    try { rec.start(); setRecording(true); } catch { setRecording(false); recordingRef.current = false; }
  }

  function arreter() {
    recordingRef.current = false;
    try { recRef.current?.stop(); } catch { /* ignore */ }
    setRecording(false); setInterim("");
  }

  async function envoyer() {
    const texte = transcript.trim();
    if (texte.length < 3) { setFlash({ t: "bad", m: "La note est vide — parle un peu au micro d'abord." }); return; }
    if (recording) arreter();
    setBusy(true); setFlash(null);
    const r = await envoyerNoteVocale({ texte, cible, lieu, priorite });
    setBusy(false);
    if (r.ok) {
      setFlash({ t: "ok", m: r.message || "Note transmise — le réseau la transforme en rapport de terrain." });
      setTranscript(""); setInterim(""); setCible(""); setLieu(""); setPriorite("normale");
    } else {
      setFlash({ t: "bad", m: r.error || "Envoi impossible." });
    }
  }

  if (!support) {
    return (
      <Card>
        <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
          <Mic className="h-6 w-6 text-faint" />
          <p className="max-w-md text-[0.85rem] text-muted">La reconnaissance vocale n&apos;est pas prise en charge par ce navigateur. Utilise <b>Chrome</b> ou <b>Edge</b> (ordinateur ou Android).</p>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader titre="Capture vocale terrain" />
      <p className="-mt-1.5 mb-4 text-[0.82rem] leading-relaxed text-muted">
        Branche ton <b>casque / micro</b>, appuie sur <b>Enregistrer</b> et raconte ce qui se passe en jeu. Tout est transcrit en direct. À l&apos;envoi, l&apos;IA en fait un <b>rapport de terrain immersif</b>, exactement comme sur Discord.
      </p>

      {/* Bouton d'enregistrement */}
      <div className="flex flex-col items-center gap-3 rounded-[12px] border border-border bg-surface-2 px-4 py-6">
        {recording ? (
          <button onClick={arreter} className="inline-flex items-center gap-2.5 rounded-full px-6 py-3.5 text-[0.95rem] font-semibold text-white" style={{ background: "var(--oxblood)" }}>
            <span className="relative flex h-4 w-4 items-center justify-center">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white/60" />
              <Square className="relative h-3.5 w-3.5" fill="currentColor" />
            </span>
            Arrêter l&apos;enregistrement
          </button>
        ) : (
          <button onClick={demarrer} className="inline-flex items-center gap-2.5 rounded-full px-6 py-3.5 text-[0.95rem] font-semibold text-black/85" style={{ background: "linear-gradient(180deg,var(--accent-hi),var(--accent))" }}>
            <Mic className="h-[1.15rem] w-[1.15rem]" /> Enregistrer
          </button>
        )}
        <span className="flex items-center gap-1.5 text-[0.74rem] text-faint">
          {recording ? <><Radio className="h-3.5 w-3.5 animate-pulse" style={{ color: "var(--oxblood)" }} /> À l&apos;écoute — parle normalement…</> : "Micro prêt. Aucun enregistrement n'est stocké : seul le texte est transmis."}
        </span>
      </div>

      {/* Transcription (éditable) */}
      <div className="mt-4">
        <label className="mb-1.5 block text-[0.72rem] uppercase tracking-[0.06em] text-faint">Transcription {recording ? "· en direct" : "· relis / corrige avant l'envoi"}</label>
        <textarea
          className={inputCls + " min-h-[140px] resize-y leading-relaxed"}
          value={transcript + (interim ? (transcript ? " " : "") + interim : "")}
          onChange={(e) => setTranscript(e.target.value)}
          placeholder="Le texte capté au micro s'affiche ici…"
        />
        {transcript ? (
          <button onClick={() => { setTranscript(""); setInterim(""); }} className="mt-1.5 inline-flex items-center gap-1.5 text-[0.74rem] text-faint hover:text-ink">
            <Trash2 className="h-3.5 w-3.5" /> Effacer
          </button>
        ) : null}
      </div>

      {/* Métadonnées facultatives */}
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Champ label="Cible / sujet (optionnel)"><input className={inputCls} value={cible} onChange={(e) => setCible(e.target.value)} placeholder="Nom, bande, lieu observé…" maxLength={120} /></Champ>
        <Champ label="Lieu (optionnel)"><input className={inputCls} value={lieu} onChange={(e) => setLieu(e.target.value)} placeholder="Valentine, Rhodes…" maxLength={120} /></Champ>
      </div>
      <div className="mt-3 flex flex-col gap-1">
        <span className="text-[0.72rem] uppercase tracking-[0.05em] text-faint">Priorité</span>
        <Picker options={PRIORITES} value={priorite} onChange={setPriorite} />
      </div>

      {flash ? (
        <div className="mt-3 flex items-start gap-2 rounded-lg border px-3 py-2.5 text-[0.82rem]" style={flash.t === "ok" ? { color: "var(--good)", borderColor: "color-mix(in srgb,var(--good) 40%,var(--border))", background: "color-mix(in srgb,var(--good) 8%,transparent)" } : { color: "var(--oxblood)", borderColor: "color-mix(in srgb,var(--oxblood) 40%,var(--border))", background: "color-mix(in srgb,var(--oxblood) 8%,transparent)" }}>
          {flash.t === "ok" ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : null}{flash.m}
        </div>
      ) : null}

      <div className="mt-4 flex justify-end">
        <button onClick={envoyer} disabled={busy || transcript.trim().length < 3} className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-[0.88rem] font-semibold text-black/85 disabled:opacity-50" style={{ background: "linear-gradient(180deg,var(--accent-hi),var(--accent))" }}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Envoyer au réseau
        </button>
      </div>
    </Card>
  );
}
