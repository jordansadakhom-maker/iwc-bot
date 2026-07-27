"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getActeur } from "@/lib/authz";
import { emettreEvenement } from "@/lib/evenements";
import { versTache, PRIORITES, STATUTS_TACHE, type Tache } from "@/lib/taches";
import { suggererAssignation, type CandidatMembre, type Suggestion } from "@/lib/attribution";

const PRIOS = new Set<string>(PRIORITES.map((p) => p.key));
const STATUTS = new Set<string>(STATUTS_TACHE.map((s) => s.key));
const s = (v: unknown, max = 300) => { const t = String(v ?? "").trim(); return t ? t.slice(0, max) : null; };
const iso = (v: unknown): string | null => { const raw = String(v ?? "").trim(); if (!raw) return null; const t = Date.parse(raw); return Number.isFinite(t) ? new Date(t).toISOString() : null; };

export async function listerTaches(): Promise<{ connecte: boolean; moiId: string | null; taches: Tache[] }> {
  const a = await getActeur();
  if (!a) return { connecte: false, moiId: null, taches: [] };
  const admin = createAdminClient();
  if (!admin) return { connecte: false, moiId: a.did, taches: [] };
  const { data, error } = await admin.from("Tache").select("*").order("createdAt", { ascending: false }).limit(400);
  if (error) return { connecte: true, moiId: a.did, taches: [] };
  return { connecte: true, moiId: a.did, taches: ((data || []) as Record<string, unknown>[]).map(versTache) };
}

export async function creerTache(data: { titre: string; detail?: string; priorite?: string; echeance?: string; pourMoi?: boolean; pole?: string }): Promise<{ ok: boolean; error?: string }> {
  const a = await getActeur();
  if (!a) return { ok: false, error: "Accès refusé — réservé aux membres connectés." };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  const titre = s(data.titre, 200);
  if (!titre) return { ok: false, error: "Donne un titre à la tâche." };
  const priorite = data.priorite && PRIOS.has(data.priorite) ? data.priorite : "normale";
  const id = `tache-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const now = new Date().toISOString();
  const { error } = await admin.from("Tache").insert({
    id, titre, detail: s(data.detail, 2000),
    assigneId: data.pourMoi ? a.did : null, assigneNom: data.pourMoi ? a.nomIC : null,
    pole: s(data.pole, 40), priorite, echeance: iso(data.echeance), statut: "a_faire",
    source: "manuel", creePar: a.nomIC, creeParId: a.did, createdAt: now, updatedAt: now, updatedBy: a.nomIC,
  });
  if (error) { console.error("creerTache:", error.message); return { ok: false, error: "Création impossible (la table Tache existe-t-elle ?)." }; }
  await emettreEvenement({ aggregate: "tache", type: "tache.creee", cibleId: id, cibleLibelle: titre, payload: { priorite, pourMoi: !!data.pourMoi } });
  return { ok: true };
}

export async function majStatutTache(id: string, statut: string): Promise<{ ok: boolean; error?: string }> {
  const a = await getActeur();
  if (!a) return { ok: false, error: "Accès refusé." };
  if (!STATUTS.has(statut)) return { ok: false, error: "Statut invalide." };
  const admin = createAdminClient();
  if (!admin || !id) return { ok: false, error: "Tâche introuvable." };
  const { error } = await admin.from("Tache").update({ statut, updatedAt: new Date().toISOString(), updatedBy: a.nomIC }).eq("id", id);
  if (error) return { ok: false, error: "Enregistrement impossible." };
  if (statut === "faite") await emettreEvenement({ aggregate: "tache", type: "tache.faite", cibleId: id });
  return { ok: true };
}

export async function assignerTacheAMoi(id: string): Promise<{ ok: boolean; error?: string }> {
  const a = await getActeur();
  if (!a) return { ok: false, error: "Accès refusé." };
  const admin = createAdminClient();
  if (!admin || !id) return { ok: false, error: "Tâche introuvable." };
  const { error } = await admin.from("Tache").update({ assigneId: a.did, assigneNom: a.nomIC, updatedAt: new Date().toISOString(), updatedBy: a.nomIC }).eq("id", id);
  return { ok: !error, error: error ? "Enregistrement impossible." : undefined };
}

// Attribution assistée : classe les membres les plus pertinents pour une tâche
// (présents, faible charge, pôle correspondant). Lecture seule.
export async function suggererMembres(pole?: string): Promise<{ ok: boolean; suggestions: Suggestion[] }> {
  const a = await getActeur();
  if (!a) return { ok: false, suggestions: [] };
  const admin = createAdminClient();
  if (!admin) return { ok: false, suggestions: [] };
  const [{ data: mem }, { data: tk }] = await Promise.all([
    admin.from("Membre").select("id,nomIC,grade,pole,statut"),
    admin.from("Tache").select("assigneId").neq("statut", "faite"),
  ]);
  const charge = new Map<string, number>();
  for (const t of (tk || []) as { assigneId: string | null }[]) { if (t.assigneId) charge.set(t.assigneId, (charge.get(t.assigneId) || 0) + 1); }
  const candidats: CandidatMembre[] = ((mem || []) as Record<string, unknown>[])
    .filter((m) => String(m.statut || "") !== "parti")
    .map((m) => ({
      id: String(m.id), nom: String(m.nomIC || m.id), grade: (m.grade as string) ?? null,
      pole: String(m.pole || ""), absent: String(m.statut || "") === "absent", charge: charge.get(String(m.id)) || 0,
    }));
  return { ok: true, suggestions: suggererAssignation(candidats, { pole: pole ?? null }, 4) };
}

export async function assignerTacheA(id: string, membreId: string, membreNom: string): Promise<{ ok: boolean; error?: string }> {
  const a = await getActeur();
  if (!a) return { ok: false, error: "Accès refusé." };
  const admin = createAdminClient();
  if (!admin || !id || !membreId) return { ok: false, error: "Tâche introuvable." };
  const { error } = await admin.from("Tache").update({ assigneId: membreId, assigneNom: s(membreNom, 120), updatedAt: new Date().toISOString(), updatedBy: a.nomIC }).eq("id", id);
  if (error) return { ok: false, error: "Enregistrement impossible." };
  await emettreEvenement({ aggregate: "tache", type: "tache.assignee", cibleId: id, payload: { assigneId: membreId } });
  return { ok: true };
}

export async function supprimerTache(id: string): Promise<{ ok: boolean; error?: string }> {
  const a = await getActeur();
  if (!a) return { ok: false, error: "Accès refusé." };
  const admin = createAdminClient();
  if (!admin || !id) return { ok: false, error: "Tâche introuvable." };
  const { error } = await admin.from("Tache").delete().eq("id", id);
  if (error) return { ok: false, error: "Suppression impossible." };
  await emettreEvenement({ aggregate: "tache", type: "suppression", cibleId: id, cibleLibelle: "Tâche" });
  return { ok: true };
}
