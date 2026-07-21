"use client";

import { useEffect, useRef, useState } from "react";
import { Gamepad2, Square, Loader2, CheckCircle2, MonitorPlay, Volume2, MonitorUp, AlertTriangle, Keyboard, X } from "lucide-react";
import { Card, CardHeader } from "@/components/ui";
import { Champ, Picker, inputCls, Modal } from "@/components/edit-ui";
import { uploadAudio } from "@/app/(app)/actions-upload";
import { envoyerNoteAudio } from "@/app/(app)/notes-vocales/actions";

const PRIORITES = [
  { key: "normale", label: "Normale" },
  { key: "importante", label: "Importante", tone: "var(--warn)" },
  { key: "urgente", label: "Urgente", tone: "var(--oxblood)" },
];

const TOUCHE_KEY = "iwc.capture.touche";

// Nom lisible d'un code de touche (event.code) pour l'afficher à l'écran.
function labelTouche(code: string) {
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  if (code.startsWith("Numpad")) return "Pavé " + code.slice(6);
  const map: Record<string, string> = {
    Space: "Espace", Enter: "Entrée", Backquote: "²",
    ControlLeft: "Ctrl", ControlRight: "Ctrl", ShiftLeft: "Maj", ShiftRight: "Maj",
    AltLeft: "Alt", AltRight: "Alt", ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→",
  };
  return map[code] || code;
}

// Capture le SON DU JEU (voix des joueurs en jeu) : partage d'écran + audio
// système via getDisplayMedia → MediaRecorder → téléversement → le bot transcrit
// (Whisper) et en fait un rapport de terrain immersif. PC uniquement (Chrome/Edge).
export function CaptureJeu() {
  const [phase, setPhase] = useState<"idle" | "rec" | "traite">("idle");
  const [rappel, setRappel] = useState(false);
  const [cible, setCible] = useState("");
  const [lieu, setLieu] = useState("");
  const [priorite, setPriorite] = useState("normale");
  const [flash, setFlash] = useState<{ t: "ok" | "bad"; m: string } | null>(null);

  const [touche, setTouche] = useState<string | null>(null);
  const [ecouteTouche, setEcouteTouche] = useState(false); // en attente du choix de la touche

  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  const support = typeof navigator !== "undefined" && !!navigator.mediaDevices?.getDisplayMedia && typeof MediaRecorder !== "undefined";

  // Charge la touche mémorisée (par navigateur, via localStorage).
  useEffect(() => {
    try { const s = localStorage.getItem(TOUCHE_KEY); if (s) setTouche(s); } catch { /* ignore */ }
  }, []);

  // Écoute clavier : choisit la touche, ou déclenche/arrête la capture.
  // ⚠️ Un site ne peut PAS capter une touche pendant que le jeu est au premier
  // plan : le raccourci ne marche que quand cette fenêtre est active.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null;
      const saisie = !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
      if (ecouteTouche) {
        e.preventDefault();
        if (e.code === "Escape") { setEcouteTouche(false); return; }
        setTouche(e.code);
        try { localStorage.setItem(TOUCHE_KEY, e.code); } catch { /* ignore */ }
        setEcouteTouche(false);
        return;
      }
      if (saisie || !touche || e.code !== touche || e.repeat) return;
      e.preventDefault();
      if (phaseRef.current === "idle") void demarrer();
      else if (phaseRef.current === "rec") arreter();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ecouteTouche, touche]);

  function oublierTouche() {
    setTouche(null);
    try { localStorage.removeItem(TOUCHE_KEY); } catch { /* ignore */ }
  }

  function stopStream() {
    try { streamRef.current?.getTracks().forEach((t) => t.stop()); } catch { /* ignore */ }
    streamRef.current = null;
  }

  async function demarrer() {
    setFlash(null);
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      const audio = stream.getAudioTracks();
      if (!audio.length) {
        stream.getTracks().forEach((t) => t.stop());
        setFlash({ t: "bad", m: "Aucun son capté — dans la fenêtre de partage, choisis « Tout l'écran » et coche « Partager l'audio du système »." });
        return;
      }
      streamRef.current = stream;
      chunksRef.current = [];
      const mime = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : (MediaRecorder.isTypeSupported("audio/ogg") ? "audio/ogg" : "");
      // 48 kbps : voix bien nette pour la transcription, fichier léger → on peut
      // enregistrer une longue scène sans atteindre la limite d'envoi (≈ 1 h+).
      const opts: MediaRecorderOptions = { audioBitsPerSecond: 48000 };
      if (mime) opts.mimeType = mime;
      const rec = new MediaRecorder(new MediaStream(audio), opts);
      rec.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = () => { void finaliser(); };
      // Si l'utilisateur coupe le partage via le navigateur, on arrête proprement.
      audio[0].addEventListener("ended", () => { if (recRef.current?.state === "recording") arreter(); });
      recRef.current = rec;
      rec.start(1000);
      setPhase("rec");
    } catch {
      setFlash({ t: "bad", m: "Partage refusé ou non disponible sur cet appareil (essaie Chrome/Edge sur PC)." });
    }
  }

  function arreter() {
    try { if (recRef.current?.state === "recording") recRef.current.stop(); } catch { /* ignore */ }
  }

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
      if (!up.ok || !up.url) { setPhase("idle"); setFlash({ t: "bad", m: up.error || "Envoi de l'audio impossible." }); return; }
      const r = await envoyerNoteAudio({ url: up.url, cible, lieu, priorite });
      setPhase("idle");
      if (r.ok) { setFlash({ t: "ok", m: r.message || "Son du jeu transcrit — le réseau en fait un rapport de terrain." }); setCible(""); setLieu(""); setPriorite("normale"); }
      else setFlash({ t: "bad", m: r.error || "Transcription impossible." });
    } catch (e) {
      setPhase("idle");
      setFlash({ t: "bad", m: (e as Error).message || "Erreur pendant le traitement." });
    }
  }

  if (!support) {
    return (
      <Card>
        <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
          <MonitorPlay className="h-6 w-6 text-faint" />
          <p className="max-w-md text-[0.85rem] text-muted">La capture du son du jeu nécessite un <b>ordinateur</b> avec <b>Chrome</b> ou <b>Edge</b> (le partage d&apos;écran avec audio système n&apos;existe pas sur mobile).</p>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader titre="Capturer le son du jeu (voix des joueurs)" />
      <ol className="-mt-1.5 mb-4 flex flex-col gap-2 text-[0.83rem] leading-relaxed">
        <li className="flex items-start gap-2.5 rounded-[10px] border border-border bg-surface-2 px-3 py-2.5">
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-[0.72rem] font-bold text-black/85" style={{ background: "var(--accent)" }}>1</span>
          <span className="text-muted">Clique <b className="text-ink">Capturer le son du jeu</b>.</span>
        </li>
        <li className="flex items-start gap-2.5 rounded-[10px] border border-border bg-surface-2 px-3 py-2.5">
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-[0.72rem] font-bold text-black/85" style={{ background: "var(--accent)" }}>2</span>
          <span className="text-muted">Dans la fenêtre du navigateur, choisis <b className="text-ink"><MonitorUp className="mb-0.5 inline h-3.5 w-3.5" /> « Tout l&apos;écran »</b>.</span>
        </li>
        <li className="flex items-start gap-2.5 rounded-[10px] border px-3 py-2.5" style={{ borderColor: "color-mix(in srgb,var(--warn) 55%,var(--border))", background: "color-mix(in srgb,var(--warn) 10%,transparent)" }}>
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-[0.72rem] font-bold text-black/85" style={{ background: "var(--warn)" }}>3</span>
          <span><b className="text-ink"><Volume2 className="mb-0.5 inline h-3.5 w-3.5" /> COCHE « Partager l&apos;audio du système »</b> <span className="text-muted">(en bas de la fenêtre). C&apos;est <b>l&apos;étape la plus importante</b> — sans elle, aucune voix n&apos;est captée.</span></span>
        </li>
        <li className="flex items-start gap-2.5 rounded-[10px] border border-border bg-surface-2 px-3 py-2.5">
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-[0.72rem] font-bold text-black/85" style={{ background: "var(--accent)" }}>4</span>
          <span className="text-muted">Laisse la scène se jouer → <b className="text-ink">⏹️ Arrêter</b>. L&apos;IA en fait un rapport de terrain.</span>
        </li>
      </ol>
      <p className="-mt-2 mb-4 text-[0.76rem] text-faint">💻 PC uniquement (Chrome/Edge). Rien n&apos;est diffusé : seul le son est enregistré puis transcrit. Le jeu peut être dans une autre appli — l&apos;audio système capte tout le son du PC.</p>
      <p className="-mt-3 mb-4 flex items-start gap-1.5 text-[0.76rem]" style={{ color: "var(--good)" }}><span aria-hidden>👥</span> <span>Une seule personne suffit <b>par lieu</b> : la voix de proximité fait entendre <b>tous les joueurs autour d&apos;elle</b>, donc sa capture les enregistre tous — pas besoin que chacun le fasse. Si l&apos;équipe est éclatée sur la carte, il faut <b>un « capteur » par endroit</b> (chacun tague son lieu ci-dessous) : la proximité ne capte que ce qui est proche.</span></p>

      <div className="flex flex-col items-center gap-3 rounded-[12px] border border-border bg-surface-2 px-4 py-6">
        {phase === "rec" ? (
          <button onClick={arreter} className="inline-flex items-center gap-2.5 rounded-full px-6 py-3.5 text-[0.95rem] font-semibold text-white" style={{ background: "var(--oxblood)" }}>
            <span className="relative flex h-4 w-4 items-center justify-center">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white/60" />
              <Square className="relative h-3.5 w-3.5" fill="currentColor" />
            </span>
            Arrêter & transcrire
          </button>
        ) : phase === "traite" ? (
          <button disabled className="inline-flex items-center gap-2.5 rounded-full px-6 py-3.5 text-[0.95rem] font-semibold text-black/85" style={{ background: "var(--accent)" }}>
            <Loader2 className="h-[1.15rem] w-[1.15rem] animate-spin" /> Transcription en cours…
          </button>
        ) : (
          <button onClick={() => setRappel(true)} className="inline-flex items-center gap-2.5 rounded-full px-6 py-3.5 text-[0.95rem] font-semibold text-black/85" style={{ background: "linear-gradient(180deg,var(--accent-hi),var(--accent))" }}>
            <Gamepad2 className="h-[1.15rem] w-[1.15rem]" /> Capturer le son du jeu
          </button>
        )}
        <span className="text-[0.74rem] text-faint">
          {phase === "rec" ? "🔴 Capture en cours — laisse la scène se jouer…" : phase === "traite" ? "Envoi + transcription Whisper…" : "Prêt."}
        </span>
      </div>

      {/* Raccourci clavier : lancer / arrêter la capture avec une touche au choix. */}
      <div className="mt-3 flex flex-wrap items-center gap-2 rounded-[12px] border border-border bg-surface-2 px-3 py-2.5 text-[0.82rem]">
        <Keyboard className="h-4 w-4 shrink-0 text-accent" />
        <span className="text-muted">Touche raccourci :</span>
        <button
          onClick={() => setEcouteTouche((v) => !v)}
          className="inline-flex min-w-[3.4rem] items-center justify-center rounded-lg border px-3 py-1.5 font-mono text-[0.82rem] font-semibold transition"
          style={ecouteTouche
            ? { color: "var(--accent-hi)", borderColor: "var(--accent)", background: "color-mix(in srgb,var(--accent) 12%,transparent)" }
            : { color: "var(--ink)", borderColor: "var(--border-2)", background: "var(--surface)" }}
        >
          {ecouteTouche ? "Appuie sur une touche…" : touche ? labelTouche(touche) : "Choisir"}
        </button>
        {touche && !ecouteTouche ? (
          <button onClick={oublierTouche} className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1.5 text-[0.76rem] text-faint hover:text-ink" title="Retirer le raccourci">
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
        <span className="w-full text-[0.72rem] text-faint sm:w-auto sm:flex-1">
          {touche
            ? <>Appuie sur <b className="text-muted">{labelTouche(touche)}</b> pour lancer, puis à nouveau pour arrêter. Marche quand cette fenêtre est ouverte au premier plan.</>
            : "Choisis une touche (ex. F9) pour lancer/arrêter sans cliquer."}
        </span>
      </div>

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

      {rappel ? (
        <Modal titre="Avant de partager" onClose={() => setRappel(false)} max={460}>
          <div className="flex flex-col gap-3">
            <p className="text-[0.86rem] text-muted">La fenêtre de partage du navigateur va s&apos;ouvrir. <b className="text-ink">Deux choses à ne pas rater :</b></p>
            <div className="flex items-start gap-2.5 rounded-[10px] border border-border bg-surface-2 px-3 py-2.5 text-[0.85rem]">
              <MonitorUp className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
              <span>Choisis <b>« Tout l&apos;écran »</b> (l&apos;onglet du haut de la fenêtre).</span>
            </div>
            <div className="flex items-start gap-2.5 rounded-[10px] border px-3 py-3 text-[0.85rem]" style={{ borderColor: "color-mix(in srgb,var(--warn) 60%,var(--border))", background: "color-mix(in srgb,var(--warn) 12%,transparent)" }}>
              <Volume2 className="mt-0.5 h-5 w-5 shrink-0" style={{ color: "var(--warn)" }} />
              <span><b className="text-ink">COCHE ✅ « Partager l&apos;audio du système »</b> — c&apos;est la petite case <b>en bas à gauche</b> de la fenêtre. <span className="text-muted">Sans elle, aucune voix n&apos;est captée.</span></span>
            </div>
            <div className="flex items-center gap-1.5 text-[0.76rem] text-faint"><AlertTriangle className="h-3.5 w-3.5" /> Oublié la case audio ? Arrête et relance, ce n&apos;est pas grave.</div>
            <div className="mt-1 flex justify-end gap-2">
              <button onClick={() => setRappel(false)} className="rounded-xl border border-border bg-surface-2 px-4 py-2.5 text-[0.85rem] font-semibold text-muted hover:text-ink">Annuler</button>
              <button onClick={() => { setRappel(false); void demarrer(); }} className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-[0.85rem] font-semibold text-black/85" style={{ background: "linear-gradient(180deg,var(--accent-hi),var(--accent))" }}>
                <MonitorUp className="h-4 w-4" /> J&apos;ai compris, partager
              </button>
            </div>
          </div>
        </Modal>
      ) : null}
    </Card>
  );
}
