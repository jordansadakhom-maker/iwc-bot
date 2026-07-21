"use client";

import { useRef, useState } from "react";
import { Gamepad2, Square, Loader2, CheckCircle2, MonitorPlay } from "lucide-react";
import { Card, CardHeader } from "@/components/ui";
import { Champ, Picker, inputCls } from "@/components/edit-ui";
import { uploadAudio } from "@/app/(app)/actions-upload";
import { envoyerNoteAudio } from "@/app/(app)/notes-vocales/actions";

const PRIORITES = [
  { key: "normale", label: "Normale" },
  { key: "importante", label: "Importante", tone: "var(--warn)" },
  { key: "urgente", label: "Urgente", tone: "var(--oxblood)" },
];

// Capture le SON DU JEU (voix des joueurs en jeu) : partage d'écran + audio
// système via getDisplayMedia → MediaRecorder → téléversement → le bot transcrit
// (Whisper) et en fait un rapport de terrain immersif. PC uniquement (Chrome/Edge).
export function CaptureJeu() {
  const [phase, setPhase] = useState<"idle" | "rec" | "traite">("idle");
  const [cible, setCible] = useState("");
  const [lieu, setLieu] = useState("");
  const [priorite, setPriorite] = useState("normale");
  const [flash, setFlash] = useState<{ t: "ok" | "bad"; m: string } | null>(null);

  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const support = typeof navigator !== "undefined" && !!navigator.mediaDevices?.getDisplayMedia && typeof MediaRecorder !== "undefined";

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
      const rec = new MediaRecorder(new MediaStream(audio), mime ? { mimeType: mime } : undefined);
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
      <div className="-mt-1.5 mb-4 rounded-[10px] border border-border bg-surface-2 p-3 text-[0.82rem] leading-relaxed text-muted">
        <b className="text-ink">Comment ça marche :</b> clique <b>Capturer</b> → dans la fenêtre du navigateur, choisis <b>« Tout l&apos;écran »</b> et <b>coche « Partager l&apos;audio du système »</b>. Le bot transcrit les voix entendues en jeu et en fait un <b>rapport de terrain immersif</b>.
        <span className="mt-1 block text-[0.76rem] text-faint">💻 PC uniquement (Chrome/Edge). Rien n&apos;est diffusé : seul le son est enregistré puis transcrit.</span>
      </div>

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
          <button onClick={demarrer} className="inline-flex items-center gap-2.5 rounded-full px-6 py-3.5 text-[0.95rem] font-semibold text-black/85" style={{ background: "linear-gradient(180deg,var(--accent-hi),var(--accent))" }}>
            <Gamepad2 className="h-[1.15rem] w-[1.15rem]" /> Capturer le son du jeu
          </button>
        )}
        <span className="text-[0.74rem] text-faint">
          {phase === "rec" ? "🔴 Capture en cours — laisse la scène se jouer…" : phase === "traite" ? "Envoi + transcription Whisper…" : "Prêt."}
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
    </Card>
  );
}
