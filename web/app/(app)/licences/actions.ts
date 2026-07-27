"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getTypesLicence, getRoleLicence } from "@/lib/licences";
import { genererNumeroLocal, PERMISSIONS, RESTRICTIONS, ROLES_LICENCE, type CapLicence } from "@/lib/licences-const";

type Admin = NonNullable<ReturnType<typeof createAdminClient>>;
export type LicenceResult = { ok: boolean; error?: string; id?: string; numero?: string };

const PERM_KEYS = new Set(PERMISSIONS.map((p) => p.key));
const RESTR_KEYS = new Set(RESTRICTIONS.map((r) => r.key));
const s = (v: unknown, max = 300): string | null => { const t = String(v ?? "").trim(); return t ? t.slice(0, max) : null; };
const newId = (p: string) => `${p}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

// Garde d'écriture par CAPACITÉ (Lot G) : chaque action exige la capacité
// correspondant au rôle du compte. L'affichage reste ouvert en lecture ; toute
// MUTATION passe par ici (les Server Actions sont des endpoints POST indépendants).
async function garde(cap: CapLicence): Promise<LicenceResult | null> {
  try { const r = await getRoleLicence(); return r.caps[cap] ? null : { ok: false, error: "Action non autorisée pour votre rôle." }; }
  catch { return { ok: false, error: "Accès refusé." }; }
}

async function auteur(): Promise<string> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return "Registre";
    const meta = (user.user_metadata || {}) as Record<string, unknown>;
    let nom = (meta.full_name || meta.name || meta.user_name || "Agent") as string;
    const did = (meta.provider_id || meta.sub || "") as string;
    const admin = createAdminClient();
    if (did && admin) { const { data } = await admin.from("Membre").select("nomIC").eq("id", String(did)).maybeSingle(); if (data?.nomIC) nom = data.nomIC as string; }
    return String(nom).slice(0, 120);
  } catch { return "Registre"; }
}

// Journal INVIOLABLE (best-effort — n'interrompt jamais l'action).
async function journal(admin: Admin, e: { licenceId?: string | null; numero?: string | null; type: string; par: string; details?: unknown }): Promise<void> {
  try { await admin.from("LicenceEvent").insert({ id: newId("lev"), licenceId: e.licenceId ?? null, numero: e.numero ?? null, type: e.type, par: e.par, details: (e.details ?? null) as Record<string, unknown> | null }); } catch { /* ignore */ }
}

// Numéro officiel : fonction SQL (séquence + clé) si dispo, sinon repli local.
async function genererNumero(admin: Admin, prefixe: string | null): Promise<string> {
  try { const { data, error } = await admin.rpc("next_licence_numero", { p_prefixe: prefixe || "LIC" }); if (!error && data) return String(data); } catch { /* fonction absente */ }
  try { const { count } = await admin.from("Licence").select("id", { count: "exact", head: true }); return genererNumeroLocal(prefixe, (count ?? 0) + 1, new Date().getFullYear()); }
  catch { return genererNumeroLocal(prefixe, Math.floor(Math.random() * 99999) + 1, new Date().getFullYear()); }
}

const filtrePerms = (v: unknown): Record<string, boolean> => {
  const o: Record<string, boolean> = {};
  if (v && typeof v === "object" && !Array.isArray(v)) for (const [k, val] of Object.entries(v as Record<string, unknown>)) if (PERM_KEYS.has(k)) o[k] = !!val;
  return o;
};
const filtreRestr = (v: unknown): string[] => (Array.isArray(v) ? v.map(String).filter((k) => RESTR_KEYS.has(k)) : []);
const dateOrNull = (v: unknown): string | null => { const t = s(v); if (!t) return null; const d = new Date(t); return Number.isNaN(d.getTime()) ? null : d.toISOString(); };

export async function creerLicence(data: Record<string, unknown>): Promise<LicenceResult> {
  const refus = await garde("creer"); if (refus) return refus;
  const admin = createAdminClient(); if (!admin) return { ok: false, error: "Service indisponible." };
  const nom = s(data.nom); if (!nom) return { ok: false, error: "Le nom est obligatoire." };
  const typeCode = s(data.typeCode); if (!typeCode) return { ok: false, error: "Choisis un type de licence." };

  const types = await getTypesLicence();
  const type = types.find((t) => t.code === typeCode);
  if (!type) return { ok: false, error: "Type de licence inconnu." };

  const par = await auteur();
  const numero = await genererNumero(admin, type.prefixe);
  const id = newId("lic");
  // Autorisations = gabarit du type, surchargé par la saisie.
  const permissions = { ...filtrePerms(type.permsDefaut), ...filtrePerms(data.permissions) };
  const row = {
    id, numero, typeCode,
    nom, prenom: s(data.prenom), photoUrl: s(data.photoUrl, 2000),
    metier: s(data.metier), grade: s(data.grade), organisation: s(data.organisation), identifiant: s(data.identifiant, 60),
    dateDelivrance: dateOrNull(data.dateDelivrance) || new Date().toISOString(),
    dateExpiration: dateOrNull(data.dateExpiration),
    delivrePar: s(data.delivrePar) || par,
    statut: "active",
    permissions, restrictions: filtreRestr(data.restrictions),
    commentaires: s(data.commentaires, 2000),
    updatedBy: par, updatedAt: new Date().toISOString(),
  };
  const { error } = await admin.from("Licence").insert(row);
  if (error) return { ok: false, error: "Création impossible (le SQL des licences a-t-il été lancé ?)." };
  await journal(admin, { licenceId: id, numero, type: "creation", par, details: { nom, typeCode } });
  return { ok: true, id, numero };
}

export async function majLicence(id: string, patch: Record<string, unknown>): Promise<LicenceResult> {
  const refus = await garde("creer"); if (refus) return refus;
  const admin = createAdminClient(); if (!admin) return { ok: false, error: "Service indisponible." };
  if (!id) return { ok: false, error: "Licence introuvable." };
  const par = await auteur();
  const row: Record<string, unknown> = {};
  const champs = ["nom", "prenom", "metier", "grade", "organisation", "identifiant", "delivrePar", "commentaires", "photoUrl"] as const;
  for (const c of champs) if (c in patch) row[c] = s(patch[c], c === "photoUrl" ? 2000 : c === "commentaires" ? 2000 : 300);
  if ("nom" in row && !row.nom) return { ok: false, error: "Le nom ne peut pas être vide." };
  if ("dateExpiration" in patch) row.dateExpiration = dateOrNull(patch.dateExpiration);
  if ("dateDelivrance" in patch) row.dateDelivrance = dateOrNull(patch.dateDelivrance) || undefined;
  if ("permissions" in patch) row.permissions = filtrePerms(patch.permissions);
  if ("restrictions" in patch) row.restrictions = filtreRestr(patch.restrictions);
  if (!Object.keys(row).length) return { ok: true, id };
  row.updatedBy = par; row.updatedAt = new Date().toISOString();
  const { error } = await admin.from("Licence").update(row).eq("id", id);
  if (error) return { ok: false, error: "Enregistrement impossible." };
  await journal(admin, { licenceId: id, type: "modification", par, details: { champs: Object.keys(row).filter((k) => k !== "updatedBy" && k !== "updatedAt") } });
  return { ok: true, id };
}

export async function suspendreLicence(id: string, motif: string, fin?: string): Promise<LicenceResult> {
  const refus = await garde("cycle"); if (refus) return refus;
  const admin = createAdminClient(); if (!admin) return { ok: false, error: "Service indisponible." };
  const par = await auteur();
  const { error } = await admin.from("Licence").update({
    statut: "suspendue", suspensionMotif: s(motif, 500), suspensionDebut: new Date().toISOString(), suspensionFin: dateOrNull(fin), suspensionPar: par, updatedBy: par, updatedAt: new Date().toISOString(),
  }).eq("id", id);
  if (error) return { ok: false, error: "Suspension impossible." };
  await journal(admin, { licenceId: id, type: "suspension", par, details: { motif: s(motif, 500), fin: dateOrNull(fin) } });
  return { ok: true, id };
}

export async function reactiverLicence(id: string): Promise<LicenceResult> {
  const refus = await garde("cycle"); if (refus) return refus;
  const admin = createAdminClient(); if (!admin) return { ok: false, error: "Service indisponible." };
  const par = await auteur();
  const { error } = await admin.from("Licence").update({
    statut: "active", suspensionMotif: null, suspensionDebut: null, suspensionFin: null, suspensionPar: null, updatedBy: par, updatedAt: new Date().toISOString(),
  }).eq("id", id);
  if (error) return { ok: false, error: "Réactivation impossible." };
  await journal(admin, { licenceId: id, type: "reactivation", par });
  return { ok: true, id };
}

export async function revoquerLicence(id: string, motif: string): Promise<LicenceResult> {
  const refus = await garde("revoquer"); if (refus) return refus;
  const admin = createAdminClient(); if (!admin) return { ok: false, error: "Service indisponible." };
  const par = await auteur();
  const { error } = await admin.from("Licence").update({
    statut: "revoquee", revocationMotif: s(motif, 500), revocationAt: new Date().toISOString(), revocationPar: par, updatedBy: par, updatedAt: new Date().toISOString(),
  }).eq("id", id);
  if (error) return { ok: false, error: "Révocation impossible." };
  await journal(admin, { licenceId: id, type: "revocation", par, details: { motif: s(motif, 500) } });
  return { ok: true, id };
}

export async function renouvelerLicence(id: string, nouvelleExpiration: string): Promise<LicenceResult> {
  const refus = await garde("cycle"); if (refus) return refus;
  const admin = createAdminClient(); if (!admin) return { ok: false, error: "Service indisponible." };
  const exp = dateOrNull(nouvelleExpiration);
  if (!exp) return { ok: false, error: "Donne la nouvelle date d'expiration." };
  const par = await auteur();
  const { error } = await admin.from("Licence").update({
    dateExpiration: exp, statut: "active", updatedBy: par, updatedAt: new Date().toISOString(),
  }).eq("id", id);
  if (error) return { ok: false, error: "Renouvellement impossible." };
  await journal(admin, { licenceId: id, type: "renouvellement", par, details: { nouvelleExpiration: exp } });
  return { ok: true, id };
}

// Interrupteur d'intégration Armurerie : activer/couper le blocage des ventes.
export async function setBlocageVentesArmurerie(actif: boolean): Promise<LicenceResult> {
  const refus = await garde("gererIntegration"); if (refus) return refus;
  const admin = createAdminClient(); if (!admin) return { ok: false, error: "Service indisponible." };
  const par = await auteur();
  const { error } = await admin.from("LicenceConfig").upsert({ cle: "bloquer_ventes_armurerie", valeur: actif ? "1" : "0", updatedAt: new Date().toISOString(), updatedBy: par }, { onConflict: "cle" });
  if (error) return { ok: false, error: "Enregistrement impossible (le SQL LicenceConfig a-t-il été lancé ?)." };
  await journal(admin, { type: actif ? "config_blocage_on" : "config_blocage_off", par });
  return { ok: true };
}

export async function supprimerLicence(id: string): Promise<LicenceResult> {
  const refus = await garde("supprimer"); if (refus) return refus;
  const admin = createAdminClient(); if (!admin) return { ok: false, error: "Service indisponible." };
  const par = await auteur();
  // Trace AVANT suppression (le journal survit à la fiche).
  let numero: string | null = null;
  try { const { data } = await admin.from("Licence").select("numero").eq("id", id).maybeSingle(); numero = (data?.numero as string) || null; } catch { /* ignore */ }
  const { error } = await admin.from("Licence").delete().eq("id", id);
  if (error) return { ok: false, error: "Suppression impossible." };
  await journal(admin, { licenceId: id, numero, type: "suppression", par });
  return { ok: true, id };
}

// ── Rôles & accès (Lot G) — attribution de rôles précis (cap « gererRoles ») ──
const roleValide = (r: unknown) => (ROLES_LICENCE.some((x) => x.key === r) ? String(r) : "consultation");

export async function creerRoleMembre(data: { nom?: string; identifiant?: string; role?: string }): Promise<LicenceResult> {
  const refus = await garde("gererRoles"); if (refus) return refus;
  const admin = createAdminClient(); if (!admin) return { ok: false, error: "Service indisponible." };
  const nom = s(data.nom); if (!nom) return { ok: false, error: "Donne le nom du membre." };
  const id = newId("lmb"); const par = await auteur();
  const { error } = await admin.from("LicenceMembre").insert({ id, nom, identifiant: s(data.identifiant, 60), role: roleValide(data.role), actif: true, updatedBy: par, updatedAt: new Date().toISOString() });
  if (error) return { ok: false, error: "Création impossible (le SQL LicenceMembre a-t-il été lancé ?)." };
  await journal(admin, { type: "role_cree", par, details: { nom, role: roleValide(data.role) } });
  return { ok: true, id };
}

export async function majRoleMembre(id: string, patch: { nom?: string; identifiant?: string; role?: string; actif?: boolean }): Promise<LicenceResult> {
  const refus = await garde("gererRoles"); if (refus) return refus;
  const admin = createAdminClient(); if (!admin) return { ok: false, error: "Service indisponible." };
  if (!id) return { ok: false, error: "Membre introuvable." };
  const row: Record<string, unknown> = {};
  if ("nom" in patch) { const n = s(patch.nom); if (!n) return { ok: false, error: "Le nom ne peut pas être vide." }; row.nom = n; }
  if ("identifiant" in patch) row.identifiant = s(patch.identifiant, 60);
  if ("role" in patch) row.role = roleValide(patch.role);
  if ("actif" in patch) row.actif = Boolean(patch.actif);
  if (!Object.keys(row).length) return { ok: true };
  const par = await auteur();
  const { error } = await admin.from("LicenceMembre").update({ ...row, updatedBy: par, updatedAt: new Date().toISOString() }).eq("id", id);
  if (error) return { ok: false, error: "Enregistrement impossible." };
  await journal(admin, { type: "role_maj", par, details: row });
  return { ok: true };
}

export async function supprimerRoleMembre(id: string): Promise<LicenceResult> {
  const refus = await garde("gererRoles"); if (refus) return refus;
  const admin = createAdminClient(); if (!admin) return { ok: false, error: "Service indisponible." };
  const { error } = await admin.from("LicenceMembre").delete().eq("id", id);
  if (error) return { ok: false, error: "Suppression impossible." };
  await journal(admin, { type: "role_supprime", par: await auteur() });
  return { ok: true };
}
