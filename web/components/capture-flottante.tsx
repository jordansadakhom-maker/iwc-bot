"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Gamepad2, Square, Loader2, X, Keyboard, Volume2, MonitorUp, CheckCircle2 } from "lucide-react";
import { uploadAudio } from "@/app/(app)/actions-upload";
import { envoyerNoteAudio } from "@/app/(app)/notes-vocales/actions";

// Bouton FLOTTANT de capture « Son du jeu », présent sur TOUTES les pages du site
// (sauf « Notes vocales » qui a déjà sa propre interface complète). Permet de
// lancer / arrêter la capture d'un clic ou d'une touche depuis n'importe où, et
// l'enregistrement continue en arrière-plan quand on navigue.
//
// ⚠️ Limite navigateur : la touche ne se déclenche que quand la fenêtre du site
// est active — aucun site ne peut capter une touche pendant que le jeu est au
// premier plan. Mais une fois lancé, l'enregistrement continue en fond.

const TOUCHE_KEY = "iwc.capture.touche";

function labelTouche(code: string) {
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  if (code.startsWith("Numpad")) return "Pavé " + code.slice(6);
  const map: Record<string, string> = { Space: "Espace", Enter: "Entrée", Backquote: "²", ControlLeft: "Ctrl", ControlRight: "Ctrl", ShiftLeft: "Maj", ShiftRight: "Maj", AltLeft: "Alt", AltRight: "Alt" };
  return map[code] || code;
}

const PRIOS = [
  { key: "normale", label: "Normale" },
  { key: "importante", label: "Importante", tone: "var(--warn)" },
  { key: "urgente", label: "Urgente", tone: "var(--oxblood)" },
];

export function CaptureFlottante() {
  const path = usePathname();
  const [phase, setPhase] = useState<"idle" | "rec" | "traite">("idle");
  const [open, setOpen] = useState(false);
  const [cible, setCible] = useState("");
  const [lieu, setLieu] = useState("");
  const [priorite, setPriorite] = useState("normale");
  const [touche, setTouche] = useState<string | null>(null);
  const [ecoute, setEcoute] = useState(false);
  const [flash, setFlash] = useState<{ t: "ok" | "bad"; m: string } | null>(null);

  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const phaseRef = useRef(phase); phaseRef.current = phase;

  const support = typeof navigator !== "undefined" && !!navigator.mediaDevices?.getDisplayMedia && typeof MediaRecorder !== "undefined";
  // La page « Notes vocales » gère déjà sa propre capture → on s'efface pour ne
  // pas dédoubler le raccourci ni les boutons.
  const actif = support && path !== "/notes-vocales";

  useEffect(() => { try { const s = localStorage.getItem(TOUCHE_KEY); if (s) setTouche(s); } catch { /* ignore */ } }, []);

  function stopStream() { try { streamRef.current?.getTracks().forEach((t) => t.stop()); } catch { /* ignore */ } streamRef.current = null; }

  async function demarrer() {
    setFlash(null); setOpen(false);
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      const audio = stream.getAudioTracks();
      if (!audio.length) {
        stream.getTracks().forEach((t) => t.stop());
        setFlash({ t: "bad", m: "Aucun son capté — choisis « Tout l'écran » et coche « Partager l'audio du système »." });
        return;
      }
      streamRef.current = stream;
      chunksRef.current = [];
      const mime = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : (MediaRecorder.isTypeSupported("audio/ogg") ? "audio/ogg" : "");
      const opts: MediaRecorderOptions = { audioBitsPerSecond: 48000 };
      if (mime) opts.mimeType = mime;
      const rec = new MediaRecorder(new MediaStream(audio), opts);
      rec.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = () => { void finaliser(); };
      audio[0].addEventListener("ended", () => { if (recRef.current?.state === "recording") arreter(); });
      recRef.current = rec;
      rec.start(1000);
      setPhase("rec");
    } catch {
      setFlash({ t: "bad", m: "Partage refusé ou indisponible (Chrome/Edge sur PC)." });
    }
  }

  function arreter() { try { if (recRef.current?.state === "recording") recRef.current.stop(); } catch { /* ignore */ } }

  async function finaliser() {
    stopStream();
    const chunks = chunksRef.current;
    if (!chunks.length) { setPhase("idle"); setFlash({ t: "bad", m: "Aucun son capté." }); return; }
    setPhase("traite");
    try {
      const type = chunks[0].type || "audio/webm";
      const blob = new Blob(chunks, { type });
      const ext = type.includes("ogg") ? "ogg" : "webm";
      const fd = new FormData();
      fd.set("file", new File([blob], `jeu.${ext}`, { type }));
      const up = await uploadAudio(fd);
      if (!up.ok || !up.url) { setPhase("idle"); setFlash({ t: "bad", m: up.error || "Envoi impossible." }); return; }
      const r = await envoyerNoteAudio({ url: up.url, cible, lieu, priorite });
      setPhase("idle");
      if (r.ok) { setFlash({ t: "ok", m: r.message || "Son du jeu transcrit — rapport généré." }); setCible(""); setLieu(""); setPriorite("normale"); }
      else setFlash({ t: "bad", m: r.error || "Transcription impossible." });
    } catch (e) {
      setPhase("idle");
      setFlash({ t: "bad", m: (e as Error).message || "Erreur pendant le traitement." });
    }
  }

  // Raccourci clavier (choix + déclenchement). Ne marche que si la fenêtre du
  // site est active — limite navigateur.
  useEffect(() => {
    if (!actif) return;
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null;
      const saisie = !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
      if (ecoute) {
        e.preventDefault();
        if (e.code === "Escape") { setEcoute(false); return; }
        setTouche(e.code); try { localStorage.setItem(TOUCHE_KEY, e.code); } catch { /* ignore */ }
        setEcoute(false); return;
      }
      if (saisie || !touche || e.code !== touche || e.repeat) return;
      e.preventDefault();
      if (phaseRef.current === "idle") void demarrer();
      else if (phaseRef.current === "rec") arreter();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actif, ecoute, touche]);

  // Auto-efface le message de succès au bout de quelques secondes.
  useEffect(() => {
    if (flash?.t !== "ok") return;
    const id = window.setTimeout(() => setFlash(null), 6000);
    return () => window.clearTimeout(id);
  }, [flash]);

  if (!actif) return null;

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-2 print:hidden">
      {/* Message flottant */}
      {flash ? (
        <div className="max-w-[300px] rounded-xl border px-3 py-2 text-[0.8rem] shadow-xl" style={flash.t === "ok"
          ? { color: "var(--good)", borderColor: "color-mix(in srgb,var(--good) 40%,var(--border))", background: "color-mix(in srgb,var(--good) 12%,var(--surface))" }
          : { color: "var(--oxblood)", borderColor: "color-mix(in srgb,var(--oxblood) 40%,var(--border))", background: "color-mix(in srgb,var(--oxblood) 12%,var(--surface))" }}>
          <div className="flex items-start gap-1.5">{flash.t === "ok" ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : null}<span>{flash.m}</span><button onClick={() => setFlash(null)} className="ml-1 shrink-0 opacity-70 hover:opacity-100"><X className="h-3.5 w-3.5" /></button></div>
        </div>
      ) : null}

      {/* Panneau (réglages avant capture) */}
      {open && phase === "idle" ? (
        <div className="w-[290px] rounded-2xl border border-border-2 bg-surface p-3.5 shadow-2xl">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[0.84rem] font-semibold">Capturer le son du jeu</span>
            <button onClick={() => setOpen(false)} className="text-faint hover:text-ink"><X className="h-4 w-4" /></button>
          </div>
          <div className="flex flex-col gap-2">
            <input value={cible} onChange={(e) => setCible(e.target.value)} placeholder="Cible / sujet (optionnel)" maxLength={120} className="w-full rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-[0.82rem] text-ink outline-none placeholder:text-faint" />
            <input value={lieu} onChange={(e) => setLieu(e.target.value)} placeholder="Lieu (optionnel)" maxLength={120} className="w-full rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-[0.82rem] text-ink outline-none placeholder:text-faint" />
            <div className="flex gap-1.5">
              {PRIOS.map((p) => (
                <button key={p.key} onClick={() => setPriorite(p.key)} className="flex-1 rounded-lg px-2 py-1 text-[0.72rem] font-semibold transition" style={priorite === p.key ? { color: "#000", background: (p.tone as string) || "var(--accent)" } : { color: "var(--muted)", background: "var(--surface-2)", border: "1px solid var(--border)" }}>{p.label}</button>
              ))}
            </div>
            <div className="flex items-start gap-1.5 rounded-lg px-2 py-1.5 text-[0.72rem]" style={{ color: "var(--warn)", background: "color-mix(in srgb,var(--warn) 10%,transparent)" }}>
              <Volume2 className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span>Choisis <b>« Tout l&apos;écran »</b> puis coche <b>« Partager l&apos;audio du système »</b>.</span>
            </div>
            <button onClick={() => void demarrer()} className="inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-[0.86rem] font-semibold text-black/85" style={{ background: "linear-gradient(180deg,var(--accent-hi),var(--accent))" }}>
              <MonitorUp className="h-4 w-4" /> Lancer la capture
            </button>
            {/* Raccourci */}
            <div className="flex items-center gap-2 border-t border-border pt-2 text-[0.74rem]">
              <Keyboard className="h-3.5 w-3.5 text-accent" /><span className="text-muted">Touche :</span>
              <button onClick={() => setEcoute((v) => !v)} className="rounded-md border px-2 py-1 font-mono text-[0.74rem] font-semibold" style={ecoute ? { color: "var(--accent-hi)", borderColor: "var(--accent)" } : { color: "var(--ink)", borderColor: "var(--border-2)" }}>{ecoute ? "Appuie…" : touche ? labelTouche(touche) : "Choisir"}</button>
              <span className="text-faint">marche site actif</span>
            </div>
          </div>
        </div>
      ) : null}

      {/* Bouton flottant principal */}
      {phase === "rec" ? (
        <button onClick={arreter} className="inline-flex items-center gap-2 rounded-full px-4 py-3 text-[0.86rem] font-semibold text-white shadow-2xl" style={{ background: "var(--oxblood)" }}>
          <span className="relative flex h-3.5 w-3.5 items-center justify-center"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white/60" /><Square className="relative h-3 w-3" fill="currentColor" /></span>
          Arrêter
        </button>
      ) : phase === "traite" ? (
        <button disabled className="inline-flex items-center gap-2 rounded-full px-4 py-3 text-[0.86rem] font-semibold text-black/85 shadow-2xl" style={{ background: "var(--accent)" }}>
          <Loader2 className="h-4 w-4 animate-spin" /> Transcription…
        </button>
      ) : (
        <button onClick={() => setOpen((v) => !v)} title="Capturer le son du jeu" className="grid h-14 w-14 place-items-center rounded-full text-black/85 shadow-2xl transition hover:scale-105" style={{ background: "linear-gradient(180deg,var(--accent-hi),var(--accent))" }}>
          <Gamepad2 className="h-6 w-6" />
        </button>
      )}
    </div>
  );
}
