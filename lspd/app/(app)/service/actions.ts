"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getActeur } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";
import { newId } from "@/lib/ids";
import { indicatifLibre } from "@/lib/service";

export type ServiceResult = { ok: boolean; error?: string; indicatif?: string | null };

const STATUTS_RADIO = ["dispo", "occupe", "intervention", "indispo"];

function messageConflit(err: { code?: string; message?: string } | null): string | null {
  const m = String(err?.message || "");
  if (err?.code === "23505" || /duplicate key|unique/i.test(m)) {
    if (/indicatif/i.test(m)) return "Cet indicatif est déjà pris par une autre unité en service. Choisis-en un autre.";
    if (/un_ouvert/i.test(m)) return "Tu es déjà en service.";
    return "Conflit : l'opération entre en collision avec une autre. Réessaie.";
  }
  return null;
}

// Prise de service : indicatif libre + canal, statut « disponible ». En quelques
// clics, sans ressaisir ce que le système connaît déjà.
export async function prendreService(input: { indicatif?: string; canalId?: string; note?: string }): Promise<ServiceResult> {
  const a = await getActeur();
  if (!a.autorise) return { ok: false, error: "Action réservée aux agents en effectif." };
  if (!a.agentId) return { ok: false, error: "Ta fiche agent n'existe pas encore — un responsable doit t'ajouter à l'effectif." };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Base non connectée." };

  // Déjà en service ?
  try {
    const { data } = await admin.from("LspdService").select("id").eq("agentId", a.agentId).is("fin", null).maybeSingle();
    if (data) return { ok: false, error: "Tu es déjà en service." };
  } catch { /* table absente → l'insert échouera proprement */ }

  const indicatif = (input.indicatif || "").trim() || (await indicatifLibre()) || "";
  let canalNom: string | null = null;
  const canalId = (input.canalId || "").trim() || null;
  if (canalId) {
    try { const { data } = await admin.from("LspdCanal").select("nom").eq("id", canalId).maybeSingle(); canalNom = data ? String((data as Record<string, unknown>).nom) : null; } catch { /* ignore */ }
  }

  // Grade/unité connus → pré-remplis.
  let unite: string | null = null;
  try { const { data } = await admin.from("LspdAgent").select("unite,matricule").eq("id", a.agentId).maybeSingle(); if (data) unite = (data as Record<string, unknown>).unite == null ? null : String((data as Record<string, unknown>).unite); } catch { /* ignore */ }

  const now = new Date().toISOString();
  const { error } = await admin.from("LspdService").insert({
    id: newId("svc"), agentId: a.agentId, agentNom: a.nom, matricule: a.matricule,
    indicatif: indicatif || null, canalId, canalNom, unite, statutRadio: "dispo", debut: now, createdAt: now,
  });
  if (error) {
    const c = messageConflit(error);
    if (c) return { ok: false, error: c };
    return { ok: false, error: "Prise de service impossible (lance 01-operations.sql ?)." };
  }
  await logAudit({ aggregate: "service", type: "service.prise", cibleId: a.agentId, cibleLibelle: `${a.nom}${indicatif ? ` · ${indicatif}` : ""}`, apres: { indicatif, canalId } });
  return { ok: true, indicatif: indicatif || null };
}

// Fin de service : clôture le service ouvert de l'agent.
export async function terminerService(): Promise<ServiceResult> {
  const a = await getActeur();
  if (!a.autorise || !a.agentId) return { ok: false, error: "Aucun service à clôturer." };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Base non connectée." };
  const now = new Date().toISOString();
  const { data, error } = await admin.from("LspdService").update({ fin: now, updatedAt: now }).eq("agentId", a.agentId).is("fin", null).select("id,indicatif");
  if (error) return { ok: false, error: "Fin de service impossible." };
  if (!data || (data as unknown[]).length === 0) return { ok: false, error: "Tu n'es pas en service." };
  await logAudit({ aggregate: "service", type: "service.fin", cibleId: a.agentId, cibleLibelle: a.nom });
  return { ok: true };
}

// Changement de statut radio (disponible / occupé / en intervention / indispo).
export async function setStatutRadio(statut: string): Promise<ServiceResult> {
  const a = await getActeur();
  if (!a.autorise || !a.agentId) return { ok: false, error: "Aucun service en cours." };
  if (!STATUTS_RADIO.includes(statut)) return { ok: false, error: "Statut invalide." };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Base non connectée." };
  const now = new Date().toISOString();
  const { data, error } = await admin.from("LspdService").update({ statutRadio: statut, updatedAt: now }).eq("agentId", a.agentId).is("fin", null).select("id");
  if (error) return { ok: false, error: "Mise à jour impossible." };
  if (!data || (data as unknown[]).length === 0) return { ok: false, error: "Tu n'es pas en service." };
  await logAudit({ aggregate: "service", type: "service.statut", cibleId: a.agentId, cibleLibelle: `${a.nom} → ${statut}` });
  return { ok: true };
}
