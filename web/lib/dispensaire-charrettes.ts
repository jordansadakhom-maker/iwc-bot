import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { type CharrettesData, type Charrette, type Besoin, type Passage } from "@/lib/dispensaire-charrettes-const";

export * from "@/lib/dispensaire-charrettes-const";

const s = (v: unknown) => (v == null ? null : String(v));
function arr<T>(v: unknown): T[] { return Array.isArray(v) ? (v as T[]) : []; }

export async function getCharrettes(): Promise<CharrettesData> {
  const vide: CharrettesData = { connecte: false, pret: false, canEdit: false, charrettes: [] };
  const admin = createAdminClient();
  if (!admin) return vide;
  const { data, error } = await admin.from("DispensaireCharrette").select("*").order("nom", { ascending: true });
  if (error) return { ...vide, connecte: true, pret: false, canEdit: true };
  const charrettes: Charrette[] = ((data || []) as Record<string, unknown>[]).map((r) => ({
    id: String(r.id), nom: String(r.nom || "Charrette"),
    detenteur: s(r.detenteur), dateReception: s(r.dateReception), note: s(r.note),
    besoins: arr<Besoin>(r.besoins), historique: arr<Passage>(r.historique),
    createdAt: String(r.createdAt || ""), updatedAt: s(r.updatedAt),
  }));
  return { connecte: true, pret: true, canEdit: true, charrettes };
}
