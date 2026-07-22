import "server-only";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAcces } from "@/lib/queries";
import { ROLES, roleDef, CONFIG_DEFAUT, type Perms, type Config } from "@/lib/dispensaire-roles-const";

export * from "@/lib/dispensaire-roles-const";

export type RoleContext = { connecte: boolean; identifiant: string | null; nom: string; role: string; perms: Perms; source: "membre" | "fallback"; membreId: string | null };
export type Membre = { id: string; identifiant: string | null; nom: string; role: string; actif: boolean; note: string | null; updatedAt: string | null; updatedBy: string | null };

const s = (v: unknown) => (v == null ? null : String(v));

// Identité du compte connecté (ID Discord + nom d'affichage).
async function identite(): Promise<{ discordId: string; nom: string }> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { discordId: "", nom: "Membre" };
    const meta = (user.user_metadata || {}) as Record<string, unknown>;
    const discordId = String(meta.provider_id || meta.sub || "");
    let nom = String(meta.full_name || meta.name || meta.user_name || user.email || "Membre");
    const admin = createAdminClient();
    if (discordId && admin) { const { data } = await admin.from("Membre").select("nomIC").eq("id", discordId).maybeSingle(); if (data?.nomIC) nom = String(data.nomIC); }
    return { discordId, nom };
  } catch { return { discordId: "", nom: "Membre" }; }
}

// Rôle EFFECTIF du compte au sein du dispensaire.
// Règle : une fiche DispensaireMembre gagne toujours ; sinon on retombe sur le
// comportement Iron Wolf actuel (permissif) — donc rien n'est « déréglé » et le
// premier directeur peut s'auto-attribuer son rôle depuis le panneau admin.
export async function getRoleDispensaire(): Promise<RoleContext> {
  const admin = createAdminClient();
  const { discordId, nom } = await identite();

  if (admin) {
    let membre: Record<string, unknown> | null = null;
    if (discordId) { const { data } = await admin.from("DispensaireMembre").select("*").eq("identifiant", discordId).maybeSingle(); membre = data as Record<string, unknown> | null; }
    if (!membre && nom) { const { data } = await admin.from("DispensaireMembre").select("*").ilike("nom", nom).maybeSingle(); membre = data as Record<string, unknown> | null; }
    if (membre && (membre.actif ?? true)) {
      const def = roleDef(String(membre.role));
      return { connecte: true, identifiant: discordId || null, nom: String(membre.nom || nom), role: def.key, perms: def.perms, source: "membre", membreId: String(membre.id) };
    }
  }

  // Repli : dérive des accès Iron Wolf (permissif par défaut) — comportement actuel.
  let a: Awaited<ReturnType<typeof getAcces>> | null = null;
  try { a = await getAcces(); } catch { a = null; }
  const perms: Perms = { admin: !!a?.direction, rh: !!a?.peutMedical, factures: !!a?.peutMedical, stock: true, medical: true, voir: true };
  const role = a?.direction ? "directeur" : a?.peutMedical ? "medecin" : "stagiaire";
  return { connecte: true, identifiant: discordId || null, nom, role, perms, source: "fallback", membreId: null };
}

export async function getMembres(): Promise<{ pret: boolean; membres: Membre[] }> {
  const admin = createAdminClient();
  if (!admin) return { pret: false, membres: [] };
  const { data, error } = await admin.from("DispensaireMembre").select("*").order("nom", { ascending: true });
  if (error) return { pret: false, membres: [] };
  const membres: Membre[] = ((data || []) as Record<string, unknown>[]).map((r) => ({
    id: String(r.id), identifiant: s(r.identifiant), nom: String(r.nom || "Membre"), role: String(r.role || "stagiaire"),
    actif: r.actif == null ? true : Boolean(r.actif), note: s(r.note), updatedAt: s(r.updatedAt), updatedBy: s(r.updatedBy),
  }));
  return { pret: true, membres };
}

// ── Configuration / seuils ──────────────────────────────────────────────────
export async function getConfig(): Promise<Config> {
  const admin = createAdminClient();
  if (!admin) return { ...CONFIG_DEFAUT };
  try {
    const { data, error } = await admin.from("DispensaireConfig").select("cle,valeur");
    if (error) return { ...CONFIG_DEFAUT };
    const cfg: Config = { ...CONFIG_DEFAUT };
    for (const r of (data || []) as Record<string, unknown>[]) {
      const cle = String(r.cle) as keyof Config;
      if (cle in cfg) { const n = Number(r.valeur); if (Number.isFinite(n)) cfg[cle] = n; }
    }
    return cfg;
  } catch { return { ...CONFIG_DEFAUT }; }
}

export const ROLES_LISTE = ROLES;
