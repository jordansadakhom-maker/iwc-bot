"use server";

import { envoyerCommande, type CommandeResult } from "@/lib/commandes";

// Transmet une note vocale (transcrite au micro dans le navigateur) au salon des
// transcriptions Discord, via la file de commandes. Le bot la poste au format du
// logiciel et l'IA la transforme en rapport de terrain immersif (pipeline existant).
export async function envoyerNoteVocale(input: {
  texte: string; cible?: string; lieu?: string; priorite?: string;
}): Promise<CommandeResult> {
  const texte = String(input.texte || "").trim();
  if (texte.length < 3) return { ok: false, error: "La note est vide — parle un peu plus au micro." };
  const priorite = ["normale", "importante", "urgente"].includes(String(input.priorite)) ? input.priorite : "normale";
  return envoyerCommande(
    "note.vocale",
    {
      texte: texte.slice(0, 3500),
      cible: String(input.cible || "").slice(0, 120),
      lieu: String(input.lieu || "").slice(0, 120),
      priorite,
    },
    { attendre: true },
  );
}

// Son du jeu (voix des joueurs en jeu) : un extrait audio déjà téléversé sur le
// stockage → le bot le télécharge, le transcrit (Whisper) et en fait un rapport.
export async function envoyerNoteAudio(input: {
  url: string; cible?: string; lieu?: string; priorite?: string;
}): Promise<CommandeResult> {
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const url = String(input.url || "").trim();
  if (!supaUrl || !url.startsWith(supaUrl)) return { ok: false, error: "Extrait audio introuvable." };
  const priorite = ["normale", "importante", "urgente"].includes(String(input.priorite)) ? input.priorite : "normale";
  return envoyerCommande(
    "note.audio",
    {
      url: url.slice(0, 500),
      cible: String(input.cible || "").slice(0, 120),
      lieu: String(input.lieu || "").slice(0, 120),
      priorite,
    },
    { attendre: true, timeoutMs: 20000 },
  );
}
