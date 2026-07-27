import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { cleNom } from "@/lib/noms";

// ── Identité patient & dossier médical (Lot 2) ───────────────────────────────
// Une fiche STABLE par patient, rapprochée par nom normalisé. N'écrase rien de
// l'existant (factures/ventes/certificats restent rattachés par nom) : la fiche
// vient enrichir la vue 360°. Dégrade proprement si le SQL n'est pas encore lancé.

export type DossierMedical = {
  id: string; nom: string;
  dateNaissance: string | null; telephone: string | null; groupeSanguin: string | null;
  allergies: string | null; antecedents: string | null; traitements: string | null;
  medecinReferent: string | null; notes: string | null;
  updatedAt: string | null; updatedBy: string | null;
};

// Champs éditables du dossier (le nom d'affichage `nom` est traité à part).
export const CHAMPS_DOSSIER = ["dateNaissance", "telephone", "groupeSanguin", "allergies", "antecedents", "traitements", "medecinReferent", "notes"] as const;
export type ChampDossier = (typeof CHAMPS_DOSSIER)[number];

const s = (v: unknown, max = 2000) => { const t = String(v ?? "").trim(); return t ? t.slice(0, max) : null; };
function newId() { return `dpa-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`; }

function toDossier(r: Record<string, unknown>): DossierMedical {
  return {
    id: String(r.id), nom: String(r.nom || ""),
    dateNaissance: r.dateNaissance == null ? null : String(r.dateNaissance),
    telephone: r.telephone == null ? null : String(r.telephone),
    groupeSanguin: r.groupeSanguin == null ? null : String(r.groupeSanguin),
    allergies: r.allergies == null ? null : String(r.allergies),
    antecedents: r.antecedents == null ? null : String(r.antecedents),
    traitements: r.traitements == null ? null : String(r.traitements),
    medecinReferent: r.medecinReferent == null ? null : String(r.medecinReferent),
    notes: r.notes == null ? null : String(r.notes),
    updatedAt: r.updatedAt == null ? null : String(r.updatedAt),
    updatedBy: r.updatedBy == null ? null : String(r.updatedBy),
  };
}

// Lit le dossier médical d'un patient (par nom normalisé). Ne crée rien.
export async function lireDossierMedical(nom: string): Promise<{ pret: boolean; existe: boolean; dossier: DossierMedical | null }> {
  const cle = cleNom(nom);
  const admin = createAdminClient();
  if (!admin || !cle) return { pret: !!admin, existe: false, dossier: null };
  try {
    const { data, error } = await admin.from("DispensairePatient").select("*").eq("nomNormalise", cle).maybeSingle();
    if (error) return { pret: false, existe: false, dossier: null };   // table absente (SQL non lancé)
    return { pret: true, existe: !!data, dossier: data ? toDossier(data as Record<string, unknown>) : null };
  } catch { return { pret: false, existe: false, dossier: null }; }
}

// Crée ou met à jour le dossier médical (« chercher ou créer » par nom normalisé).
// Renvoie l'id de la fiche. Robuste aux courses (repli update sur conflit d'unicité).
export async function ecrireDossierMedical(nom: string, patch: Record<string, unknown>, par: string): Promise<{ ok: boolean; error?: string; id?: string }> {
  const cle = cleNom(nom);
  const nomAff = s(nom, 200);
  if (!cle || !nomAff) return { ok: false, error: "Indique le nom du patient." };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };

  const champs: Record<string, unknown> = {};
  for (const c of CHAMPS_DOSSIER) if (c in patch) champs[c] = s(patch[c], c === "antecedents" || c === "traitements" || c === "notes" ? 4000 : 200);
  const now = new Date().toISOString();

  try {
    const { data: ex } = await admin.from("DispensairePatient").select("id").eq("nomNormalise", cle).maybeSingle();
    if (ex) {
      const id = String((ex as Record<string, unknown>).id);
      const { error } = await admin.from("DispensairePatient").update({ nom: nomAff, ...champs, updatedBy: par, updatedAt: now }).eq("id", id);
      return error ? { ok: false, error: "Enregistrement impossible." } : { ok: true, id };
    }
    const id = newId();
    const { error } = await admin.from("DispensairePatient").insert({ id, nom: nomAff, nomNormalise: cle, ...champs, updatedBy: par, updatedAt: now, createdAt: now });
    if (!error) return { ok: true, id };
    // Course : une fiche vient d'être créée pour ce nom → on met à jour la sienne.
    const { data: ex2 } = await admin.from("DispensairePatient").select("id").eq("nomNormalise", cle).maybeSingle();
    if (ex2) { const id2 = String((ex2 as Record<string, unknown>).id); await admin.from("DispensairePatient").update({ nom: nomAff, ...champs, updatedBy: par, updatedAt: now }).eq("id", id2); return { ok: true, id: id2 }; }
    return { ok: false, error: "Création impossible (lance dispensaire-patients.sql ?)." };
  } catch { return { ok: false, error: "Création impossible (lance dispensaire-patients.sql ?)." }; }
}
