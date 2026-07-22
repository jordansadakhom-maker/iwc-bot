import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { Certificat, CertData, Rapport, RapportsData, Doc, DocsData } from "@/lib/dispensaire-docs-const";

export * from "@/lib/dispensaire-docs-const";

const s = (v: unknown) => (v == null ? null : String(v));
const num = (v: unknown) => Number(v) || 0;

// ── Certificats ─────────────────────────────────────────────────────────────
export async function getCertificats(): Promise<CertData> {
  const vide: CertData = { connecte: false, pret: false, canEdit: false, certificats: [] };
  const admin = createAdminClient();
  if (!admin) return vide;
  const { data, error } = await admin.from("DispensaireCertificat").select("*").order("createdAt", { ascending: false }).limit(300);
  if (error) return { ...vide, connecte: true, pret: false, canEdit: true };
  const certificats: Certificat[] = ((data || []) as Record<string, unknown>[]).map((r) => ({
    id: String(r.id), patient: String(r.patient || "?"), type: String(r.type || "aptitude"), medecin: s(r.medecin),
    dateActe: s(r.dateActe), dureeRepos: num(r.dureeRepos), contenu: s(r.contenu), note: s(r.note), par: s(r.par), createdAt: String(r.createdAt),
  }));
  return { connecte: true, pret: true, canEdit: true, certificats };
}

// ── Rapports médicaux ───────────────────────────────────────────────────────
export async function getRapports(): Promise<RapportsData> {
  const vide: RapportsData = { connecte: false, pret: false, canEdit: false, rapports: [], categories: [] };
  const admin = createAdminClient();
  if (!admin) return vide;
  const { data, error } = await admin.from("DispensaireRapport").select("*").order("createdAt", { ascending: false }).limit(300);
  if (error) return { ...vide, connecte: true, pret: false, canEdit: true };
  const rapports: Rapport[] = ((data || []) as Record<string, unknown>[]).map((r) => ({
    id: String(r.id), titre: String(r.titre || "Rapport"), categorie: s(r.categorie), patient: s(r.patient), lien: s(r.lien), auteur: s(r.auteur), note: s(r.note), par: s(r.par), createdAt: String(r.createdAt),
  }));
  const categories = [...new Set(rapports.map((d) => (d.categorie || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  return { connecte: true, pret: true, canEdit: true, rapports, categories };
}

// ── Documents ───────────────────────────────────────────────────────────────
export async function getDocuments(): Promise<DocsData> {
  const vide: DocsData = { connecte: false, pret: false, canEdit: false, documents: [], categories: [] };
  const admin = createAdminClient();
  if (!admin) return vide;
  const { data, error } = await admin.from("DispensaireDocument").select("*").order("createdAt", { ascending: false }).limit(300);
  if (error) return { ...vide, connecte: true, pret: false, canEdit: true };
  const documents: Doc[] = ((data || []) as Record<string, unknown>[]).map((r) => ({
    id: String(r.id), titre: String(r.titre || "Document"), categorie: s(r.categorie), type: String(r.type || "lien"), url: s(r.url), note: s(r.note), par: s(r.par), createdAt: String(r.createdAt),
  }));
  const categories = [...new Set(documents.map((d) => (d.categorie || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  return { connecte: true, pret: true, canEdit: true, documents, categories };
}
