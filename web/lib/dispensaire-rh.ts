import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getAcces } from "@/lib/queries";
import { getConfig } from "@/lib/dispensaire-roles";
import { cleNom } from "@/lib/noms";

// Accès au site rapproché depuis DispensaireMembre (par nom) → la fiche RH « sait »
// si la personne peut se connecter, sous quel grade, et si son Discord est lié.
// null = pas de liste blanche d'accès (mode Iron Wolf intégré) → colonne masquée.
export type SalarieAcces = { present: boolean; actif: boolean; role: string | null; lieDiscord: boolean };
export type Salarie = {
  id: string; nom: string; grade: string | null; qualifications: string | null;
  dateEmbauche: string | null; compteBancaire: string | null; telegramme: string | null;
  statut: string; absJustifiees: number; absInjustifiees: number; notes: string | null;
  updatedAt: string | null; updatedBy: string | null; acces?: SalarieAcces | null;
};
export type RhData = { connecte: boolean; pret: boolean; canEdit: boolean; salaries: Salarie[]; seuilRenvoi: number };

// Nombre d'absences INJUSTIFIÉES à partir duquel le salarié est signalé « à renvoyer ».
export const SEUIL_RENVOI = 3;

const s = (v: unknown) => (v == null ? null : String(v));
const num = (v: unknown) => Number(v) || 0;

export async function getRh(): Promise<RhData> {
  const vide: RhData = { connecte: false, pret: false, canEdit: false, salaries: [], seuilRenvoi: SEUIL_RENVOI };
  const admin = createAdminClient();
  if (!admin) return vide;
  const acces = await getAcces();
  const canEdit = acces.peutMedical;
  const seuilRenvoi = (await getConfig()).seuilRenvoi;
  const { data, error } = await admin.from("DispensaireSalarie").select("*").order("nom", { ascending: true });
  if (error) return { connecte: true, pret: false, canEdit, salaries: [], seuilRenvoi };

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
    notes: s(r.notes), updatedAt: s(r.updatedAt), updatedBy: s(r.updatedBy),
    acces: accesParNom ? (accesParNom.get(cleNom(r.nom)) ?? { present: false, actif: false, role: null, lieDiscord: false }) : null,
  }));
  return { connecte: true, pret: true, canEdit, salaries, seuilRenvoi };
}
