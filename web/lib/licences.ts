import "server-only";

import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { statutEffectif, type Licence, type LicenceType, type StatutLicence } from "@/lib/licences-const";

export * from "@/lib/licences-const";

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
