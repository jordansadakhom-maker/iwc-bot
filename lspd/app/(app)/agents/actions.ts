"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { requirePerm } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";
import { newId } from "@/lib/ids";

export type AgentResult = { ok: boolean; error?: string; id?: string };

const REFUS = "Accès refusé : droit « gérer les agents » requis.";
const STATUTS = ["actif", "probation", "suspendu", "reserve", "parti"];
const s = (v: unknown, max = 200) => { const t = String(v ?? "").trim(); return t ? t.slice(0, max) : null; };

type Champ = "nom" | "matricule" | "grade" | "unite" | "identifiant" | "statut" | "telephone" | "note" | "dateIntegration";
const CHAMPS: Champ[] = ["nom", "matricule", "grade", "unite", "identifiant", "statut", "telephone", "note", "dateIntegration"];

function nettoyer(data: Record<string, unknown>) {
  const row: Record<string, unknown> = {};
  for (const c of CHAMPS) if (c in data) {
    if (c === "statut") row[c] = STATUTS.includes(String(data[c])) ? data[c] : "actif";
    else if (c === "dateIntegration") { const t = String(data[c] ?? "").slice(0, 10); row[c] = /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null; }
    else row[c] = s(data[c], c === "note" ? 1000 : 120);
  }
  return row;
}

export async function creerAgent(data: Record<string, unknown>): Promise<AgentResult> {
  const a = await requirePerm("agents.gerer");
  if (!a) return { ok: false, error: REFUS };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Base non connectée." };
  const row = nettoyer(data);
  if (!row.nom) return { ok: false, error: "Le nom de l'agent est obligatoire." };
  const id = newId("agt");
  const now = new Date().toISOString();
  const { error } = await admin.from("LspdAgent").insert({ id, statut: "actif", actif: true, ...row, createdAt: now, updatedAt: now, updatedBy: a.nom });
  if (error) {
    if (error.code === "23505") return { ok: false, error: "Un agent avec cet identifiant Discord existe déjà." };
    return { ok: false, error: "Création impossible (lance 00-socle.sql ?)." };
  }
  await logAudit({ aggregate: "agent", type: "agent.cree", cibleId: id, cibleLibelle: String(row.nom), apres: row });
  return { ok: true, id };
}

export async function majAgent(id: string, patch: Record<string, unknown>): Promise<AgentResult> {
  const a = await requirePerm("agents.gerer");
  if (!a) return { ok: false, error: REFUS };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Base non connectée." };
  if (!id) return { ok: false, error: "Agent introuvable." };
  const row = nettoyer(patch);
  if ("nom" in row && !row.nom) return { ok: false, error: "Le nom ne peut pas être vide." };
  if (!Object.keys(row).length) return { ok: true };
  const { error } = await admin.from("LspdAgent").update({ ...row, updatedAt: new Date().toISOString(), updatedBy: a.nom }).eq("id", id);
  if (error) {
    if (error.code === "23505") return { ok: false, error: "Cet identifiant Discord est déjà rattaché à un autre agent." };
    return { ok: false, error: "Enregistrement impossible." };
  }
  await logAudit({ aggregate: "agent", type: "agent.maj", cibleId: id, cibleLibelle: String(row.nom ?? id), apres: row });
  return { ok: true };
}

export async function basculerActif(id: string, actif: boolean): Promise<AgentResult> {
  const a = await requirePerm("agents.gerer");
  if (!a) return { ok: false, error: REFUS };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Base non connectée." };
  const { error } = await admin.from("LspdAgent").update({ actif, updatedAt: new Date().toISOString(), updatedBy: a.nom }).eq("id", id);
  if (error) return { ok: false, error: "Opération impossible." };
  await logAudit({ aggregate: "agent", type: actif ? "agent.reactive" : "agent.desactive", cibleId: id });
  return { ok: true };
}

export async function supprimerAgent(id: string): Promise<AgentResult> {
  const a = await requirePerm("agents.gerer");
  if (!a) return { ok: false, error: REFUS };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Base non connectée." };
  const { error } = await admin.from("LspdAgent").delete().eq("id", id);
  if (error) return { ok: false, error: "Suppression impossible." };
  await logAudit({ aggregate: "agent", type: "agent.supprime", cibleId: id });
  return { ok: true };
}
