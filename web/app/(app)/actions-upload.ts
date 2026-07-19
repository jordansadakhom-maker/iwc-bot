"use server";

import { createAdminClient } from "@/lib/supabase/admin";

// Téléversement d'une photo vers Supabase Storage (bucket « iwc », public en
// lecture). L'écriture passe par la clé service CÔTÉ SERVEUR uniquement — la clé
// ne quitte jamais le serveur. Renvoie l'URL publique de l'image.

export type UploadResult = { ok: boolean; url?: string; error?: string };

const BUCKET = "iwc";
const MAX = 10 * 1024 * 1024; // 10 Mo
const MIME_OK = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"]);

export async function uploadPhoto(formData: FormData): Promise<UploadResult> {
  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, error: "Aucune image reçue." };
  if (file.size > MAX) return { ok: false, error: "Image trop lourde (max 10 Mo)." };
  if (file.type && !MIME_OK.has(file.type)) return { ok: false, error: "Format non pris en charge (PNG, JPEG, WEBP, GIF)." };

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
