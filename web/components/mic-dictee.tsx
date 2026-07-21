"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, Volume2, Square } from "lucide-react";

// ── Synthèse vocale (l'IA répond à voix haute) ──────────────────
export function parler(texte: string) {
  try {
    const synth = typeof window !== "undefined" ? window.speechSynthesis : null;
    if (!synth) return;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(String(texte || "").slice(0, 700));
    u.lang = "fr-FR"; u.rate = 1; u.pitch = 1;
    synth.speak(u);
  } catch { /* ignore */ }
}
export function stopParler() { try { window.speechSynthesis?.cancel(); } catch { /* ignore */ } }

// Bouton « Écouter » : lit un texte à voix haute (bascule lecture / arrêt).
export function LireBtn({ texte, className }: { texte: string; className?: string }) {
  const [on, setOn] = useState(false);
  const [support, setSupport] = useState(false);
  useEffect(() => { setSupport(typeof window !== "undefined" && !!window.speechSynthesis); }, []);
  useEffect(() => () => stopParler(), []);
  if (!support || !texte?.trim()) return null;
  function toggle() {
    if (on) { stopParler(); setOn(false); return; }
    try {
      const synth = window.speechSynthesis;
      synth.cancel();
      const u = new SpeechSynthesisUtterance(texte.slice(0, 700));
      u.lang = "fr-FR";
      u.onend = () => setOn(false);
      u.onerror = () => setOn(false);
      synth.speak(u); setOn(true);
    } catch { setOn(false); }
  }
  return (
    <button type="button" onClick={toggle} title={on ? "Arrêter la lecture" : "Écouter"}
      className={className || "inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-[0.74rem] font-semibold text-muted transition hover:border-border-2 hover:text-ink"}>
      {on ? <Square className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />} {on ? "Stop" : "Écouter"}
    </button>
  );
}

// Dictée vocale via l'API Web Speech (reconnaissance native du navigateur, en
// français). Aucun serveur, aucune dépendance : on branche le micro et le texte
// dicté est renvoyé via onText. Le bouton se masque si le navigateur ne gère pas
// la reconnaissance (Safari ancien, Firefox) — Chrome / Edge sont pris en charge.
type SpeechAlt = { transcript: string };
type SpeechResult = ArrayLike<SpeechAlt> & { isFinal: boolean };
type SpeechEvent = { resultIndex: number; results: ArrayLike<SpeechResult> };
type SpeechRec = {
  lang: string; continuous: boolean; interimResults: boolean; maxAlternatives: number;
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

export function MicButton({ onText, onError, title = "Dicter" }: { onText: (t: string) => void; onError?: (m: string) => void; title?: string }) {
  const [support, setSupport] = useState(false);
  const [listening, setListening] = useState(false);
  const recRef = useRef<SpeechRec | null>(null);

  useEffect(() => { setSupport(!!getCtor()); }, []);
  useEffect(() => () => { try { recRef.current?.stop(); } catch { /* ignore */ } }, []);

  function toggle() {
    if (listening) { try { recRef.current?.stop(); } catch { /* ignore */ } return; }
    const Ctor = getCtor();
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = "fr-FR";
    rec.continuous = false;
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => {
      let txt = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal && r[0]) txt += r[0].transcript;
      }
      if (txt.trim()) onText(txt.trim());
    };
    rec.onend = () => { setListening(false); recRef.current = null; };
    rec.onerror = (e) => {
      setListening(false); recRef.current = null;
      if (e?.error === "not-allowed" || e?.error === "service-not-allowed") onError?.("Micro refusé — autorise l'accès au microphone dans le navigateur.");
    };
    recRef.current = rec;
    try { rec.start(); setListening(true); } catch { setListening(false); }
  }

  if (!support) return null;
  return (
    <button
      type="button" onClick={toggle} title={listening ? "Arrêter la dictée" : title}
      className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-[0.84rem] font-semibold transition"
      style={listening
        ? { color: "#fff", background: "var(--oxblood)", borderColor: "var(--oxblood)" }
        : { color: "var(--muted)", background: "var(--surface-2)", borderColor: "var(--border)" }}
    >
      <span className="relative flex items-center justify-center">
        {listening ? <span className="absolute inline-flex h-4 w-4 animate-ping rounded-full" style={{ background: "rgba(255,255,255,.5)" }} /> : null}
        <Mic className="relative h-4 w-4" />
      </span>
      {listening ? "À l'écoute…" : "Dicter"}
    </button>
  );
}
