import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { estAutorise } from "@/lib/dispensaire-roles";
import { toChambre, ETATS_CHAMBRE, type ChambresData, type EtatChambre } from "@/lib/dispensaire-chambres-const";

export * from "@/lib/dispensaire-chambres-const";

async function q<T>(p: PromiseLike<{ data: T | null }>): Promise<T | null> { try { return (await p).data; } catch { return null; } }

export async function getChambres(): Promise<ChambresData> {
  const stats0 = { libre: 0, occupee: 0, reservee: 0, nettoyage: 0 } as Record<EtatChambre, number>;
  const vide: ChambresData = { pret: false, canEdit: false, chambres: [], patients: [], medecins: [], stats: { ...stats0 } };
  const admin = createAdminClient();
  if (!admin) return vide;
  const canEdit = await estAutorise();
  if (!canEdit) return { ...vide, pret: true };

  const { data, error } = await admin.from("DispensaireChambre").select("*").order("nom", { ascending: true }).limit(500);
  if (error) return { ...vide, pret: false, canEdit };   // table absente (SQL non lancé)
  const chambres = ((data || []) as Record<string, unknown>[]).map(toChambre);

  const stats = { ...stats0 };
  for (const c of chambres) if ((ETATS_CHAMBRE as string[]).includes(c.etat)) stats[c.etat] += 1;

  const [ventes, certs, salaries] = await Promise.all([
    q<Record<string, unknown>[]>(admin.from("DispensaireVente").select("patient").order("createdAt", { ascending: false }).limit(300)),
    q<Record<string, unknown>[]>(admin.from("DispensaireCertificat").select("patient").order("createdAt", { ascending: false }).limit(200)),
    q<Record<string, unknown>[]>(admin.from("DispensaireSalarie").select("nom,statut").order("nom", { ascending: true })),
  ]);
  const setP = new Set<string>();
  for (const c of chambres) if (c.patient) setP.add(c.patient);
  for (const r of ventes || []) { const t = String(r.patient || "").trim(); if (t) setP.add(t); }
  for (const r of certs || []) { const t = String(r.patient || "").trim(); if (t) setP.add(t); }
  const patients = [...setP].sort((a, b) => a.localeCompare(b)).slice(0, 400);
  const medecins = ((salaries || []) as Record<string, unknown>[]).filter((s) => String(s.statut || "actif") !== "renvoye").map((s) => String(s.nom || "").trim()).filter(Boolean);

  return { pret: true, canEdit, chambres, patients, medecins, stats };
}
