"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionProfile } from "@/lib/queries";

// Certificats médicaux — ouvert au personnel soignant connecté.
export type CertResult = { ok: boolean; error?: string; id?: string };

const TYPES = ["medical", "arret", "aptitude", "inaptitude", "deces", "autre"];
const s = (v: unknown, max = 400) => { const t = String(v ?? "").trim(); return t ? t.slice(0, max) : null; };
const n = (v: unknown) => Math.max(0, Math.round(Number(v) || 0));
const dt = (v: unknown) => { const t = String(v ?? "").trim(); return /^\d{4}-\d{2}-\d{2}/.test(t) ? t.slice(0, 10) : null; };
function newId() { return `dc-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`; }
async function qui() { try { return (await getSessionProfile())?.nom || "Équipe"; } catch { return "Équipe"; } }

export async function creerCertificat(data: Record<string, unknown>): Promise<CertResult> {
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  const patient = s(data.patient, 200);
  if (!patient) return { ok: false, error: "Indique le patient." };
  const type = TYPES.includes(String(data.type)) ? String(data.type) : "medical";
  const id = newId();
  const { error } = await admin.from("DispensaireCertificat").insert({
    id, patient, type, medecin: s(data.medecin, 200), dateActe: dt(data.dateActe), dureeRepos: n(data.dureeRepos),
    contenu: s(data.contenu, 4000), note: s(data.note, 1000), par: await qui(), createdAt: new Date().toISOString(),
  });
  return error ? { ok: false, error: "Enregistrement impossible (la table existe-t-elle ?)." } : { ok: true, id };
}

export async function supprimerCertificat(id: string): Promise<CertResult> {
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  const { error } = await admin.from("DispensaireCertificat").delete().eq("id", id);
  return error ? { ok: false, error: "Suppression impossible." } : { ok: true };
}
