import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { estSalarieActif } from "@/lib/dispensaire-personnel-const";
import { estAutorise } from "@/lib/dispensaire-roles";
import { toRDV, type RendezVousData } from "@/lib/dispensaire-rendez-vous-const";

export * from "@/lib/dispensaire-rendez-vous-const";

async function q<T>(p: PromiseLike<{ data: T | null }>): Promise<T | null> { try { return (await p).data; } catch { return null; } }

export async function getRendezVous(): Promise<RendezVousData> {
  const vide: RendezVousData = { pret: false, canEdit: false, aVenir: [], passes: [], patients: [], medecins: [] };
  const admin = createAdminClient();
  if (!admin) return vide;
  const canEdit = await estAutorise();
  if (!canEdit) return { ...vide, pret: true };

  const { data, error } = await admin.from("DispensaireRendezVous").select("*").order("debut", { ascending: true }).limit(500);
  if (error) return { ...vide, pret: false, canEdit };   // table absente (SQL non lancé)
  const tous = ((data || []) as Record<string, unknown>[]).map(toRDV);

  const nowIso = new Date().toISOString();
  // À venir : encore « prévu » et pas dans le passé, du plus proche au plus lointain.
  const aVenir = tous.filter((r) => r.etat === "prevu" && r.debut >= nowIso);
  // Passés / clôturés : le reste, du plus récent au plus ancien.
  const passes = tous.filter((r) => !(r.etat === "prevu" && r.debut >= nowIso)).sort((a, b) => b.debut.localeCompare(a.debut)).slice(0, 40);

  const [ventes, certs, salaries] = await Promise.all([
    q<Record<string, unknown>[]>(admin.from("DispensaireVente").select("patient").order("createdAt", { ascending: false }).limit(300)),
    q<Record<string, unknown>[]>(admin.from("DispensaireCertificat").select("patient").order("createdAt", { ascending: false }).limit(200)),
    q<Record<string, unknown>[]>(admin.from("DispensaireSalarie").select("nom,statut").order("nom", { ascending: true })),
  ]);
  const setP = new Set<string>();
  for (const r of tous) if (r.patient) setP.add(r.patient);
  for (const r of ventes || []) { const t = String(r.patient || "").trim(); if (t) setP.add(t); }
  for (const r of certs || []) { const t = String(r.patient || "").trim(); if (t) setP.add(t); }
  const patients = [...setP].sort((a, b) => a.localeCompare(b)).slice(0, 400);
  const medecins = ((salaries || []) as Record<string, unknown>[]).filter((s) => estSalarieActif(s.statut)).map((s) => String(s.nom || "").trim()).filter(Boolean);

  return { pret: true, canEdit, aVenir, passes, patients, medecins };
}
