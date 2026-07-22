"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionProfile } from "@/lib/queries";

// Documents — bibliothèque du dispensaire (fichiers téléversés ou liens).
export type DocResult = { ok: boolean; error?: string; id?: string };

const s = (v: unknown, max = 400) => { const t = String(v ?? "").trim(); return t ? t.slice(0, max) : null; };
function newId() { return `dd-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`; }
async function qui() { try { return (await getSessionProfile())?.nom || "Équipe"; } catch { return "Équipe"; } }

export async function creerDocument(data: Record<string, unknown>): Promise<DocResult> {
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  const titre = s(data.titre, 300);
  if (!titre) return { ok: false, error: "Donne un titre au document." };
  const url = s(data.url, 1000);
  if (!url) return { ok: false, error: "Ajoute un fichier ou un lien." };
  const type = String(data.type) === "fichier" ? "fichier" : "lien";
  const id = newId();
  const { error } = await admin.from("DispensaireDocument").insert({ id, titre, categorie: s(data.categorie, 120), type, url, note: s(data.note, 1000), par: await qui(), createdAt: new Date().toISOString() });
  return error ? { ok: false, error: "Enregistrement impossible (la table existe-t-elle ?)." } : { ok: true, id };
}

export async function supprimerDocument(id: string): Promise<DocResult> {
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  const { error } = await admin.from("DispensaireDocument").delete().eq("id", id);
  return error ? { ok: false, error: "Suppression impossible." } : { ok: true };
}
