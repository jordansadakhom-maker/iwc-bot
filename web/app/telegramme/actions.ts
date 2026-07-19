"use server";

import { createAdminClient } from "@/lib/supabase/admin";

// Enregistre un télégramme envoyé depuis la page PUBLIQUE (sans connexion).
// Écrit côté serveur (clé service) dans TelegrammeWeb. Le bot relève les
// nouveaux télégrammes et prévient l'équipe dans le salon Discord dédié.

export type TgInput = { nom: string; contact: string; message: string; website?: string; ms?: number };
export type TgResult = { ok: boolean; error?: string };

export async function envoyerTelegrammeWeb(data: TgInput): Promise<TgResult> {
  if (data.website && data.website.trim()) return { ok: true }; // honeypot
  if (typeof data.ms === "number" && data.ms >= 0 && data.ms < 1500) return { ok: true }; // rempli trop vite = robot

  const nom = (data.nom || "").trim();
  const message = (data.message || "").trim();
  const contact = (data.contact || "").trim();
  if (nom.length < 2) return { ok: false, error: "Indique ton nom." };
  if (message.length < 3) return { ok: false, error: "Écris ton message." };
  if ((nom + message + contact).length > 4000) return { ok: false, error: "Message trop long." };

  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible. Réessaie dans un instant." };

  const id = crypto.randomUUID();
  const { error } = await admin.from("TelegrammeWeb").insert({
    id, nom: nom.slice(0, 120), contact: contact.slice(0, 200), message: message.slice(0, 2000), statut: "nouveau",
  });
  if (error) {
    console.error("envoyerTelegrammeWeb:", error.message);
    if (/TelegrammeWeb|does not exist|relation/i.test(error.message)) return { ok: false, error: "Le service de télégrammes n'est pas encore prêt (table à créer)." };
    return { ok: false, error: "Envoi impossible pour le moment. Réessaie dans un instant." };
  }
  return { ok: true };
}
