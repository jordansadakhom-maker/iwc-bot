"use server";

import { createAdminClient } from "@/lib/supabase/admin";

// Téléversement d'une photo vers Supabase Storage (bucket « iwc », public en
// lecture). L'écriture passe par la clé service CÔTÉ SERVEUR uniquement — la clé
// ne quitte jamais le serveur. Renvoie l'URL publique de l'image.

export type UploadResult = { ok: boolean; url?: string; error?: string };

const BUCKET = "iwc";
const MAX = 10 * 1024 * 1024; // 10 Mo
// Images + PDF (scan de commande/coffre lu par l'IA). Le PDF nécessite aussi que
// « application/pdf » soit autorisé sur le bucket « iwc » côté Supabase Storage.
const MIME_OK = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif", "application/pdf"]);

export async function uploadPhoto(formData: FormData): Promise<UploadResult> {
  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, error: "Aucun fichier reçu." };
  if (file.size > MAX) return { ok: false, error: "Fichier trop lourd (max 10 Mo)." };
  if (file.type && !MIME_OK.has(file.type)) return { ok: false, error: "Format non pris en charge (PNG, JPEG, WEBP, GIF, PDF)." };

  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };

  const dossier = String(formData.get("dossier") || "divers").replace(/[^a-z0-9_-]/gi, "").slice(0, 40) || "divers";
  const ext = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "png";
  const path = `${dossier}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  try {
    const buf = Buffer.from(await file.arrayBuffer());
    const { error } = await admin.storage.from(BUCKET).upload(path, buf, {
      contentType: file.type || "image/png",
      upsert: false,
    });
    if (error) {
      console.error("uploadPhoto:", error.message);
      if (/bucket/i.test(error.message)) return { ok: false, error: "Le stockage n'est pas encore prêt (bucket « iwc » à créer)." };
      return { ok: false, error: "Envoi impossible pour le moment." };
    }
    const { data } = admin.storage.from(BUCKET).getPublicUrl(path);
    return { ok: true, url: data.publicUrl };
  } catch (e) {
    console.error("uploadPhoto:", (e as Error).message);
    return { ok: false, error: "Envoi impossible pour le moment." };
  }
}

// Téléversement d'un extrait AUDIO (son du jeu capté sur le site) vers le même
// bucket. Le bot le télécharge ensuite, le transcrit (Whisper) et en fait un
// rapport de terrain. Formats navigateur courants (webm/ogg/mp4/wav).
const MAX_AUDIO = 24 * 1024 * 1024; // 24 Mo (limite Whisper : 25 Mo)
const MIME_AUDIO = /^(audio|video)\/(webm|ogg|mp4|mpeg|wav|x-wav|x-m4a|mp3)/i;

export async function uploadAudio(formData: FormData): Promise<UploadResult> {
  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, error: "Aucun audio reçu." };
  if (file.size > MAX_AUDIO) return { ok: false, error: "Extrait trop long (max ~24 Mo). Enregistre une scène plus courte." };
  if (file.type && !MIME_AUDIO.test(file.type)) return { ok: false, error: "Format audio non pris en charge." };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  const ext = (file.type.split("/").pop() || "webm").replace(/[^a-z0-9]/gi, "").slice(0, 5) || "webm";
  const path = `audio/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  try {
    const buf = Buffer.from(await file.arrayBuffer());
    const { error } = await admin.storage.from(BUCKET).upload(path, buf, { contentType: file.type || "audio/webm", upsert: false });
    if (error) {
      console.error("uploadAudio:", error.message);
      if (/bucket/i.test(error.message)) return { ok: false, error: "Le stockage n'est pas encore prêt (bucket « iwc » à créer)." };
      return { ok: false, error: "Envoi impossible pour le moment." };
    }
    const { data } = admin.storage.from(BUCKET).getPublicUrl(path);
    return { ok: true, url: data.publicUrl };
  } catch (e) {
    console.error("uploadAudio:", (e as Error).message);
    return { ok: false, error: "Envoi impossible pour le moment." };
  }
}
