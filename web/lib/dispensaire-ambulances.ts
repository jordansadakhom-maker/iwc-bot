import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { estAutorise } from "@/lib/dispensaire-roles";
import { toAmbulance, ETATS_AMBULANCE, type AmbulancesData, type EtatAmbulance } from "@/lib/dispensaire-ambulances-const";

export * from "@/lib/dispensaire-ambulances-const";

export async function getAmbulances(): Promise<AmbulancesData> {
  const stats0 = { disponible: 0, en_intervention: 0, entretien: 0, hs: 0 } as Record<EtatAmbulance, number>;
  const vide: AmbulancesData = { pret: false, canEdit: false, ambulances: [], stats: { ...stats0 } };
  const admin = createAdminClient();
  if (!admin) return vide;
  const canEdit = await estAutorise();
  if (!canEdit) return { ...vide, pret: true };

  const { data, error } = await admin.from("DispensaireAmbulance").select("*").order("nom", { ascending: true }).limit(200);
  if (error) return { ...vide, pret: false, canEdit };   // table absente (SQL non lancé)
  const ambulances = ((data || []) as Record<string, unknown>[]).map(toAmbulance);

  const stats = { ...stats0 };
  for (const a of ambulances) if ((ETATS_AMBULANCE as string[]).includes(a.etat)) stats[a.etat] += 1;

  return { pret: true, canEdit, ambulances, stats };
}
