import "server-only";

import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAcces, getSessionDiscordId, getSessionProfile } from "@/lib/queries";
import { statutEffectif, statutDef, capsDe, type Licence, type LicenceType, type StatutLicence, type CapsLicence } from "@/lib/licences-const";

export * from "@/lib/licences-const";

// ── Rôle & capacités du compte connecté (Lot G) ─────────────────────────────
// Priorité à la fiche LicenceMembre (par ID Discord) ; sinon repli sur les accès
// IWC (Direction = complet ; Armurier = armurier ; sinon consultation) — sans
// jamais enfermer quelqu'un. Pour restreindre précisément une personne, lui
// attribuer un rôle dans « Rôles & accès ».
export type RoleLicenceContext = { role: string; caps: CapsLicence; nom: string; identifiant: string | null };

export const getRoleLicence = cache(async (): Promise<RoleLicenceContext> => {
  const admin = createAdminClient();
  const [did, prof] = await Promise.all([getSessionDiscordId(), getSessionProfile()]);
  const nom = prof?.nom || "Agent";
  let roleKey: string | null = null;
  if (admin && did) {
    try { const { data } = await admin.from("LicenceMembre").select("role,actif").eq("identifiant", did).maybeSingle(); if (data && ((data as Record<string, unknown>).actif ?? true)) roleKey = String((data as Record<string, unknown>).role); } catch { /* table absente */ }
  }
  if (!roleKey) {
    const acces = await getAcces().catch(() => null);
    roleKey = acces?.direction ? "direction" : acces?.armurier ? "armurier" : "consultation";
  }
  return { role: roleKey, caps: capsDe(roleKey), nom, identifiant: did };
});

export type LicenceMembre = { id: string; identifiant: string | null; nom: string; role: string; actif: boolean };

export async function getLicenceMembres(): Promise<{ pret: boolean; membres: LicenceMembre[] }> {
  const admin = createAdminClient();
  if (!admin) return { pret: false, membres: [] };
  try {
    const { data, error } = await admin.from("LicenceMembre").select("*").order("nom", { ascending: true });
    if (error) return { pret: false, membres: [] };
    const membres = ((data || []) as Record<string, unknown>[]).map((r) => ({ id: String(r.id), identifiant: s(r.identifiant), nom: String(r.nom || "Membre"), role: String(r.role || "consultation"), actif: r.actif == null ? true : Boolean(r.actif) }));
    return { pret: true, membres };
  } catch { return { pret: false, membres: [] }; }
}

const s = (v: unknown): string | null => (v == null ? null : String(v));
const asPerms = (v: unknown): Record<string, boolean> => {
  if (v && typeof v === "object" && !Array.isArray(v)) {
    const o: Record<string, boolean> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) o[k] = !!val;
    return o;
  }
  return {};
};
const asRestr = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => String(x)) : []);

function mapType(r: Record<string, unknown>): LicenceType {
  return {
    code: String(r.code), nom: String(r.nom || r.code), description: s(r.description),
    permsDefaut: asPerms(r.permsDefaut), prefixe: s(r.prefixe),
    actif: r.actif == null ? true : !!r.actif, ordre: Number(r.ordre) || 0,
  };
}

function mapLicence(r: Record<string, unknown>, typeNom: string | null): Licence {
  return {
    id: String(r.id), numero: String(r.numero), typeCode: String(r.typeCode), typeNom,
    nom: String(r.nom || ""), prenom: s(r.prenom), photoUrl: s(r.photoUrl),
    metier: s(r.metier), grade: s(r.grade), organisation: s(r.organisation), identifiant: s(r.identifiant),
    dateDelivrance: String(r.dateDelivrance), dateExpiration: s(r.dateExpiration), delivrePar: s(r.delivrePar),
    statut: (String(r.statut || "active") as StatutLicence),
    permissions: asPerms(r.permissions), restrictions: asRestr(r.restrictions),
    commentaires: s(r.commentaires),
    suspensionMotif: s(r.suspensionMotif), suspensionDebut: s(r.suspensionDebut), suspensionFin: s(r.suspensionFin), suspensionPar: s(r.suspensionPar),
    revocationMotif: s(r.revocationMotif), revocationAt: s(r.revocationAt), revocationPar: s(r.revocationPar),
    createdAt: String(r.createdAt || new Date().toISOString()), updatedAt: s(r.updatedAt), updatedBy: s(r.updatedBy),
  };
}

// Types de licences (triés du plus « haut » au plus bas). Mémoïsé par requête.
export const getTypesLicence = cache(async (): Promise<LicenceType[]> => {
  const admin = createAdminClient();
  if (!admin) return [];
  try {
    const { data, error } = await admin.from("LicenceType").select("*").order("ordre", { ascending: false });
    if (error || !data) return [];
    return (data as Record<string, unknown>[]).map(mapType);
  } catch { return []; }
});

async function nomsDesTypes(admin: NonNullable<ReturnType<typeof createAdminClient>>): Promise<Record<string, string>> {
  try {
    const { data } = await admin.from("LicenceType").select("code,nom");
    const m: Record<string, string> = {};
    for (const r of (data || []) as Record<string, unknown>[]) m[String(r.code)] = String(r.nom || r.code);
    return m;
  } catch { return {}; }
}

export type LicencesData = { pret: boolean; licences: Licence[]; types: LicenceType[] };

// Registre complet (fiches + types). `pret` = le SQL a bien été exécuté.
export const getLicences = cache(async (): Promise<LicencesData> => {
  const admin = createAdminClient();
  if (!admin) return { pret: false, licences: [], types: [] };
  try {
    const [{ data, error }, types] = await Promise.all([
      admin.from("Licence").select("*").order("createdAt", { ascending: false }).limit(2000),
      getTypesLicence(),
    ]);
    if (error) return { pret: false, licences: [], types };
    const noms: Record<string, string> = {};
    for (const t of types) noms[t.code] = t.nom;
    const licences = ((data || []) as Record<string, unknown>[]).map((r) => mapLicence(r, noms[String(r.typeCode)] || null));
    return { pret: true, licences, types };
  } catch { return { pret: false, licences: [], types: [] }; }
});

export async function getLicence(id: string): Promise<Licence | null> {
  const admin = createAdminClient();
  if (!admin || !id) return null;
  try {
    const { data } = await admin.from("Licence").select("*").eq("id", id).maybeSingle();
    if (!data) return null;
    const noms = await nomsDesTypes(admin);
    return mapLicence(data as Record<string, unknown>, noms[String((data as Record<string, unknown>).typeCode)] || null);
  } catch { return null; }
}

// Recherche RAPIDE par nom / prénom / numéro (vérification au comptoir).
export async function rechercheLicences(q: string): Promise<Licence[]> {
  const admin = createAdminClient();
  const terme = (q || "").trim();
  if (!admin || terme.length < 2) return [];
  try {
    const like = `%${terme.replace(/[%_]/g, "")}%`;
    const { data } = await admin
      .from("Licence")
      .select("*")
      .or(`nom.ilike.${like},prenom.ilike.${like},numero.ilike.${like}`)
      .order("createdAt", { ascending: false })
      .limit(50);
    if (!data) return [];
    const noms = await nomsDesTypes(admin);
    return (data as Record<string, unknown>[]).map((r) => mapLicence(r, noms[String(r.typeCode)] || null));
  } catch { return []; }
}

// ── Intégration Armurerie (Lot E) ───────────────────────────────────────────
export type LicenceConfig = { bloquerVentes: boolean };

// Réglages du registre (interrupteur de blocage des ventes). Mémoïsé par requête.
export const getLicenceConfig = cache(async (): Promise<LicenceConfig> => {
  const def: LicenceConfig = { bloquerVentes: false };
  const admin = createAdminClient(); if (!admin) return def;
  try {
    const { data } = await admin.from("LicenceConfig").select("cle,valeur");
    const m: Record<string, string> = {};
    for (const r of (data || []) as Record<string, unknown>[]) m[String(r.cle)] = String(r.valeur);
    return { bloquerVentes: m["bloquer_ventes_armurerie"] === "1" };
  } catch { return def; }
});

export type VerifAchat = { ok: boolean; motif: string; licence: Licence | null };

// Vérifie qu'un acquéreur a le droit d'acheter une arme (licence valide, achat
// autorisé, restrictions respectées). Best-effort de correspondance par nom.
export async function verifierAchatArme(acquereur: string, categorie?: string | null): Promise<VerifAchat> {
  const admin = createAdminClient();
  const nom = (acquereur || "").trim();
  if (!admin || nom.length < 2) return { ok: false, motif: "Acquéreur non identifié.", licence: null };
  try {
    const tokens = nom.toLowerCase().split(/\s+/).map((t) => t.replace(/[%_,]/g, "")).filter((t) => t.length > 1);
    if (!tokens.length) return { ok: false, motif: "Acquéreur non identifié.", licence: null };
    const ors = tokens.map((t) => `nom.ilike.%${t}%,prenom.ilike.%${t}%`).join(",");
    const { data } = await admin.from("Licence").select("*").or(ors).limit(50);
    const norm = nom.toLowerCase();
    const scored = ((data || []) as Record<string, unknown>[]).map((r) => mapLicence(r, null)).map((l) => {
      let sc = 0;
      if (l.nom && norm.includes(l.nom.toLowerCase())) sc += 2;
      if (l.prenom && norm.includes(l.prenom.toLowerCase())) sc += 1;
      if (statutEffectif(l) === "active") sc += 0.5;
      return { l, sc };
    }).filter((x) => x.sc > 0).sort((a, b) => b.sc - a.sc);
    if (!scored.length) return { ok: false, motif: "Aucune licence enregistrée pour cet acquéreur.", licence: null };
    const licence = scored[0].l;
    const eff = statutEffectif(licence);
    if (eff !== "active") return { ok: false, motif: `Licence ${statutDef(eff).label.toLowerCase()}.`, licence };
    if (!licence.permissions["acheter_arme"]) return { ok: false, motif: "La licence n'autorise pas l'achat d'arme.", licence };
    if (licence.restrictions.includes("no_achat")) return { ok: false, motif: "Restriction : interdiction d'achat.", licence };
    const cat = (categorie || "").toLowerCase();
    if (licence.restrictions.includes("no_arme_longue") && /longue|fusil|carabine|rifle|shotgun|sniper/.test(cat)) return { ok: false, motif: "Restriction : armes longues interdites.", licence };
    if (licence.restrictions.includes("no_auto") && /auto|mitrail/.test(cat)) return { ok: false, motif: "Restriction : armes automatiques interdites.", licence };
    return { ok: true, motif: "Licence valide.", licence };
  } catch { return { ok: false, motif: "Vérification indisponible.", licence: null }; }
}

// Trace une tentative d'achat refusée dans le journal (best-effort).
export async function logRefusAchat(e: { acquereur: string; motif: string; licenceId: string | null; numero: string | null; par: string; categorie?: string | null }): Promise<void> {
  const admin = createAdminClient(); if (!admin) return;
  try {
    await admin.from("LicenceEvent").insert({
      id: `lev-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      licenceId: e.licenceId, numero: e.numero, type: "refus", par: e.par,
      details: { acquereur: e.acquereur, motif: e.motif, categorie: e.categorie ?? null },
    });
  } catch { /* ignore */ }
}

export type LicencesStats = { total: number; active: number; suspendue: number; revoquee: number; expiree: number; renouvellements: number };

// Statistiques du tableau de bord (statut EFFECTIF — expiration à la volée).
export async function getStatsLicences(): Promise<LicencesStats> {
  const vide: LicencesStats = { total: 0, active: 0, suspendue: 0, revoquee: 0, expiree: 0, renouvellements: 0 };
  const { licences } = await getLicences();
  const st = { ...vide };
  for (const l of licences) {
    st.total++;
    const eff = statutEffectif(l);
    st[eff]++;
    const j = l.dateExpiration ? Math.ceil((Date.parse(l.dateExpiration) - Date.now()) / 86400000) : null;
    if (eff === "active" && j != null && j >= 0 && j <= 30) st.renouvellements++;
  }
  return st;
}
