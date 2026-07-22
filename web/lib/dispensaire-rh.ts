import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getAcces } from "@/lib/queries";
import { getConfig } from "@/lib/dispensaire-roles";

export type Salarie = {
  id: string; nom: string; grade: string | null; qualifications: string | null;
  dateEmbauche: string | null; compteBancaire: string | null; telegramme: string | null;
  statut: string; absJustifiees: number; absInjustifiees: number; notes: string | null;
  updatedAt: string | null; updatedBy: string | null;
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
  const salaries: Salarie[] = ((data || []) as Record<string, unknown>[]).map((r) => ({
    id: String(r.id), nom: String(r.nom || "Salarié"), grade: s(r.grade), qualifications: s(r.qualifications),
    dateEmbauche: s(r.dateEmbauche), compteBancaire: s(r.compteBancaire), telegramme: s(r.telegramme),
    statut: String(r.statut || "actif"), absJustifiees: num(r.absJustifiees), absInjustifiees: num(r.absInjustifiees),
    notes: s(r.notes), updatedAt: s(r.updatedAt), updatedBy: s(r.updatedBy),
  }));
  return { connecte: true, pret: true, canEdit, salaries, seuilRenvoi };
}
