import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { estAutorise, peutSoigner } from "@/lib/dispensaire-roles";
import { toIntervention, STATUTS_INTERV_EN_COURS, type InterventionsData } from "@/lib/dispensaire-interventions-const";

export * from "@/lib/dispensaire-interventions-const";

async function q<T>(p: PromiseLike<{ data: T | null }>): Promise<T | null> { try { return (await p).data; } catch { return null; } }

export async function getInterventions(): Promise<InterventionsData> {
  const vide: InterventionsData = { pret: false, canEdit: false, enCours: [], recentes: [], patients: [], medecins: [] };
  const admin = createAdminClient();
  if (!admin) return vide;
  // Lecture ouverte au personnel autorisé ; l'écriture (actions) exige le droit soignant.
  const [canVoir, canEdit] = await Promise.all([estAutorise(), peutSoigner()]);
  if (!canVoir) return { ...vide, pret: true };

  const { data, error } = await admin.from("DispensaireIntervention").select("*").order("createdAt", { ascending: false }).limit(400);
  if (error) return { ...vide, pret: false, canEdit };   // table absente (SQL non lancé)
  const toutes = ((data || []) as Record<string, unknown>[]).map(toIntervention);

  const enCours = toutes.filter((i) => (STATUTS_INTERV_EN_COURS as string[]).includes(i.statut));
  const recentes = toutes.filter((i) => !(STATUTS_INTERV_EN_COURS as string[]).includes(i.statut)).slice(0, 30);

  const [ventes, certs, salaries] = await Promise.all([
    q<Record<string, unknown>[]>(admin.from("DispensaireVente").select("patient").order("createdAt", { ascending: false }).limit(300)),
    q<Record<string, unknown>[]>(admin.from("DispensaireCertificat").select("patient").order("createdAt", { ascending: false }).limit(200)),
    q<Record<string, unknown>[]>(admin.from("DispensaireSalarie").select("nom,statut").order("nom", { ascending: true })),
  ]);
  const setP = new Set<string>();
  for (const i of toutes) if (i.patient) setP.add(i.patient);
  for (const r of ventes || []) { const t = String(r.patient || "").trim(); if (t) setP.add(t); }
  for (const r of certs || []) { const t = String(r.patient || "").trim(); if (t) setP.add(t); }
  const patients = [...setP].sort((a, b) => a.localeCompare(b)).slice(0, 400);
  const medecins = ((salaries || []) as Record<string, unknown>[]).filter((s) => String(s.statut || "actif") !== "renvoye").map((s) => String(s.nom || "").trim()).filter(Boolean);

  return { pret: true, canEdit, enCours, recentes, patients, medecins };
}
