import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export type CanalOpt = { id: string; nom: string; code: string | null; type: string };
export type MonService = {
  id: string; indicatif: string | null; canalId: string | null; canalNom: string | null;
  statutRadio: string; unite: string | null; debut: string;
};

// Canaux radio actifs (pour la prise de service et le panneau radio).
export async function getCanaux(): Promise<CanalOpt[]> {
  const admin = createAdminClient();
  if (!admin) return [];
  try {
    const { data } = await admin.from("LspdCanal").select("id,nom,code,type").eq("actif", true).order("ordre", { ascending: true });
    return ((data || []) as Record<string, unknown>[]).map((c) => ({ id: String(c.id), nom: String(c.nom || ""), code: c.code == null ? null : String(c.code), type: String(c.type || "patrol") }));
  } catch {
    return [];
  }
}

// Service OUVERT de l'agent (ou null).
export async function getMonService(agentId: string | null): Promise<MonService | null> {
  if (!agentId) return null;
  const admin = createAdminClient();
  if (!admin) return null;
  try {
    const { data } = await admin.from("LspdService").select("id,indicatif,canalId,canalNom,statutRadio,unite,debut").eq("agentId", agentId).is("fin", null).maybeSingle();
    if (!data) return null;
    const r = data as Record<string, unknown>;
    return { id: String(r.id), indicatif: r.indicatif == null ? null : String(r.indicatif), canalId: r.canalId == null ? null : String(r.canalId), canalNom: r.canalNom == null ? null : String(r.canalNom), statutRadio: String(r.statutRadio || "dispo"), unite: r.unite == null ? null : String(r.unite), debut: String(r.debut) };
  } catch {
    return null;
  }
}

// Plan d'indicatifs par défaut (configurable plus tard via LspdConfig). Propose
// le premier indicatif LIBRE (non utilisé par un service actuellement ouvert).
const PLAN_DEFAUT = Array.from({ length: 40 }, (_, i) => `A-${i + 1}`);

export async function indicatifLibre(): Promise<string | null> {
  const admin = createAdminClient();
  if (!admin) return PLAN_DEFAUT[0];
  let pris = new Set<string>();
  try {
    const { data } = await admin.from("LspdService").select("indicatif").is("fin", null);
    for (const r of (data || []) as Record<string, unknown>[]) {
      if (r.indicatif) pris.add(String(r.indicatif));
    }
  } catch { pris = new Set(); }
  for (const i of PLAN_DEFAUT) if (!pris.has(i)) return i;
  return null; // plan épuisé → l'agent saisit un indicatif manuel
}
