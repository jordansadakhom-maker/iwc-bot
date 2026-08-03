import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getConfig, peutGererRH } from "@/lib/dispensaire-roles";
import { cleNom } from "@/lib/noms";
import type { Sanction } from "@/lib/dispensaire-sanctions-const";

// Accès au site rapproché depuis DispensaireMembre (par nom) → la fiche RH « sait »
// si la personne peut se connecter, sous quel grade, et si son Discord est lié.
// null = pas de liste blanche d'accès (mode Iron Wolf intégré) → colonne masquée.
export type SalarieAcces = { present: boolean; actif: boolean; role: string | null; lieDiscord: boolean };
export type Salarie = {
  id: string; nom: string; grade: string | null; qualifications: string | null;
  dateEmbauche: string | null; compteBancaire: string | null; telegramme: string | null;
  statut: string; absJustifiees: number; absInjustifiees: number; notes: string | null;
  dateDepart: string | null; motifDepart: string | null;
  updatedAt: string | null; updatedBy: string | null; acces?: SalarieAcces | null;
};
export type RhData = { connecte: boolean; pret: boolean; canEdit: boolean; salaries: Salarie[]; seuilRenvoi: number; sanctionsParSalarie: Record<string, Sanction[]> };

// Nombre d'absences INJUSTIFIÉES à partir duquel le salarié est signalé « à renvoyer ».
export const SEUIL_RENVOI = 3;

const s = (v: unknown) => (v == null ? null : String(v));
const num = (v: unknown) => Number(v) || 0;

export async function getRh(): Promise<RhData> {
  const vide: RhData = { connecte: false, pret: false, canEdit: false, salaries: [], seuilRenvoi: SEUIL_RENVOI, sanctionsParSalarie: {} };
  const admin = createAdminClient();
  if (!admin) return vide;
  const canEdit = await peutGererRH();
  const seuilRenvoi = (await getConfig()).seuilRenvoi;
  const { data, error } = await admin.from("DispensaireSalarie").select("*").order("nom", { ascending: true });
  if (error) return { connecte: true, pret: false, canEdit, salaries: [], seuilRenvoi, sanctionsParSalarie: {} };

  // Sanctions disciplinaires groupées par salarié (dégradation propre si la table
  // n'existe pas encore — aucune sanction, aucun crash).
  const sanctionsParSalarie: Record<string, Sanction[]> = {};
  try {
    const { data: sanc } = await admin.from("DispensaireSanction").select("*").order("date", { ascending: false }).order("createdAt", { ascending: false }).limit(1000);
    for (const r of ((sanc as Record<string, unknown>[]) || [])) {
      const sid = s(r.salarieId); if (!sid) continue;
      (sanctionsParSalarie[sid] ||= []).push({
        id: String(r.id), salarieId: sid, nom: String(r.nom || "Salarié"), type: String(r.type || "autre"),
        motif: s(r.motif), date: r.date == null ? null : String(r.date).slice(0, 10), duree: s(r.duree),
        commentaire: s(r.commentaire), par: s(r.par), createdAt: s(r.createdAt),
      });
    }
  } catch { /* table absente → aucune sanction */ }

  // Rapprochement RH ↔ accès : on lit la liste blanche (DispensaireMembre) et on
  // l'associe à chaque salarié par nom normalisé. Une seule fiche à consulter.
  let accesParNom: Map<string, SalarieAcces> | null = null;
  try {
    const { data: mData } = await admin.from("DispensaireMembre").select("nom,role,actif,identifiant");
    const membres = ((mData as Record<string, unknown>[]) || []);
    if (membres.length) {
      accesParNom = new Map<string, SalarieAcces>();
      for (const m of membres) {
        const k = cleNom(m.nom); if (!k) continue;
        const item: SalarieAcces = { present: true, actif: m.actif !== false, role: s(m.role), lieDiscord: !!(m.identifiant && String(m.identifiant).trim()) };
        const cur = accesParNom.get(k);
        // Une fiche active l'emporte sur une inactive (cas d'homonymes/doublons).
        if (!cur || (item.actif && !cur.actif)) accesParNom.set(k, item);
      }
    }
  } catch { accesParNom = null; }

  const salaries: Salarie[] = ((data || []) as Record<string, unknown>[]).map((r) => ({
    id: String(r.id), nom: String(r.nom || "Salarié"), grade: s(r.grade), qualifications: s(r.qualifications),
    dateEmbauche: s(r.dateEmbauche), compteBancaire: s(r.compteBancaire), telegramme: s(r.telegramme),
    statut: String(r.statut || "actif"), absJustifiees: num(r.absJustifiees), absInjustifiees: num(r.absInjustifiees),
    notes: s(r.notes), dateDepart: s(r.dateDepart), motifDepart: s(r.motifDepart), updatedAt: s(r.updatedAt), updatedBy: s(r.updatedBy),
    acces: accesParNom ? (accesParNom.get(cleNom(r.nom)) ?? { present: false, actif: false, role: null, lieDiscord: false }) : null,
  }));
  return { connecte: true, pret: true, canEdit, salaries, seuilRenvoi, sanctionsParSalarie };
}
