import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { estAutorise, peutSoigner, peutFacturer } from "@/lib/dispensaire-roles";
import { statutsDe, estOuverte } from "@/lib/dispensaire-facturation-const";
import { ETATS_EN_COURS, toPEC, type PrisesEnChargeData } from "@/lib/dispensaire-prises-en-charge-const";

export * from "@/lib/dispensaire-prises-en-charge-const";

// ── Workflow médical : prises en charge (Lot 3.1) ────────────────────────────
// Un épisode de soin piloté comme une machine à états : admis → en_soin →
// terminé (ou annulé). Vue « tableau de bord » : ce qui est en cours + le récent.

async function q<T>(p: PromiseLike<{ data: T | null }>): Promise<T | null> { try { return (await p).data; } catch { return null; } }

export async function getPrisesEnCharge(): Promise<PrisesEnChargeData> {
  const vide: PrisesEnChargeData = { pret: false, canEdit: false, canSoigner: false, canFacturer: false, enCours: [], recentes: [], patients: [], medecins: [] };
  const admin = createAdminClient();
  if (!admin) return vide;
  const [canEdit, canSoigner, canFacturer] = await Promise.all([estAutorise(), peutSoigner(), peutFacturer()]);
  if (!canEdit) return { ...vide, pret: true };

  const { data, error } = await admin.from("DispensairePriseEnCharge").select("*").order("admisAt", { ascending: false }).limit(400);
  if (error) return { ...vide, pret: false, canEdit, canSoigner, canFacturer };   // table absente (SQL non lancé)
  const toutes = ((data || []) as Record<string, unknown>[]).map(toPEC);

  // En cours (admis/en_soin) : les plus anciens d'abord (attente la plus longue en tête).
  const enCours = toutes.filter((p) => (ETATS_EN_COURS as string[]).includes(p.etat)).sort((a, b) => a.admisAt.localeCompare(b.admisAt));
  const recentes = toutes.filter((p) => !(ETATS_EN_COURS as string[]).includes(p.etat)).slice(0, 30);

  // Rattache la facture liée aux épisodes terminés (pour encaisser depuis le tableau).
  const factureIds = [...new Set(recentes.map((p) => p.factureId).filter(Boolean) as string[])];
  if (factureIds.length) {
    const facts = await q<Record<string, unknown>[]>(admin.from("DispensaireFacture").select("id,montant,statut,statuts").in("id", factureIds));
    const map = new Map<string, { montant: number; payee: boolean }>();
    for (const f of facts || []) map.set(String(f.id), { montant: Number(f.montant) || 0, payee: !estOuverte(statutsDe(f)) });
    for (const p of recentes) if (p.factureId && map.has(p.factureId)) p.facture = map.get(p.factureId);
  }

  // Listes d'autocomplétion (patients connus + médecins salariés).
  const [ventes, certs, salaries] = await Promise.all([
    q<Record<string, unknown>[]>(admin.from("DispensaireVente").select("patient").order("createdAt", { ascending: false }).limit(300)),
    q<Record<string, unknown>[]>(admin.from("DispensaireCertificat").select("patient").order("createdAt", { ascending: false }).limit(200)),
    q<Record<string, unknown>[]>(admin.from("DispensaireSalarie").select("nom,statut").order("nom", { ascending: true })),
  ]);
  const setP = new Set<string>();
  for (const p of toutes) if (p.patient) setP.add(p.patient);
  for (const r of ventes || []) { const t = String(r.patient || "").trim(); if (t) setP.add(t); }
  for (const r of certs || []) { const t = String(r.patient || "").trim(); if (t) setP.add(t); }
  const patients = [...setP].sort((a, b) => a.localeCompare(b)).slice(0, 400);
  const medecins = ((salaries || []) as Record<string, unknown>[])
    .filter((s) => String(s.statut || "actif") !== "renvoye")
    .map((s) => String(s.nom || "").trim()).filter(Boolean);

  return { pret: true, canEdit, canSoigner, canFacturer, enCours, recentes, patients, medecins };
}
