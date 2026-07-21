"use client";

import { useState } from "react";
import { Mic, Gamepad2 } from "lucide-react";
import { NotesVocales } from "@/components/notes-vocales";
import { CaptureJeu } from "@/components/capture-jeu";

// Deux façons de capturer une scène :
//  • « Son du jeu » (les voix des joueurs en jeu) — partage d'écran + audio système.
//  • « Ma voix » (le micro) — pour narrer / dicter soi-même.
export function NotesVocalesModes() {
  const [mode, setMode] = useState<"jeu" | "micro">("jeu");
  const Onglet = ({ k, icon: Icon, children }: { k: "jeu" | "micro"; icon: typeof Mic; children: React.ReactNode }) => (
    <button
      onClick={() => setMode(k)}
      className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-[0.84rem] font-semibold transition sm:flex-none"
      style={mode === k
        ? { color: "#000", background: "linear-gradient(180deg,var(--accent-hi),var(--accent))", borderColor: "transparent" }
        : { color: "var(--muted)", background: "var(--surface-2)", borderColor: "var(--border)" }}
    >
      <Icon className="h-4 w-4" /> {children}
    </button>
  );
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5 sm:flex-row">
        <Onglet k="jeu" icon={Gamepad2}>Son du jeu (les joueurs)</Onglet>
        <Onglet k="micro" icon={Mic}>Ma voix (micro)</Onglet>
      </div>
      {mode === "jeu" ? <CaptureJeu /> : <NotesVocales />}
    </div>
  );
}
