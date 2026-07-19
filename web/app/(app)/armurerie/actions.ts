"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { envoyerCommande } from "@/lib/commandes";

// Comptoir de l'armurerie de Van Horn — registre PRIVÉ de l'entreprise, écrit
// directement dans Supabase (tables neuves, jamais touchées par le bot). Seul
// l'envoi d'un contrat au client passe par le bot (message privé Discord).

export type ArmResult = { ok: boolean; error?: string; id?: string };

function s(v: unknown, max = 300): string | null { const t = String(v ?? "").trim(); return t ? t.slice(0, max) : null; }
function newId(prefix: string) { return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`; }

// ── Clients ──────────────────────────────────────────────────────
export async function creerClient(d: { nom: string; telegramme?: string; discordId?: string; carteIdentite?: string; statut?: string; notes?: string }): Promise<ArmResult> {
  if (!d.nom || d.nom.trim().length < 2) return { ok: false, error: "Indique le nom du client." };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service indisponible." };
  const id = newId("cli");
  const { error } = await admin.from("ArmurerieClient").insert({
    id, nom: s(d.nom, 120), telegramme: s(d.telegramme, 60), discordId: s(d.discordId, 40),
    carteIdentite: s(d.carteIdentite, 500), statut: s(d.statut, 40) || "actif", notes: s(d.notes, 2000),
  });
  if (error) return { ok: false, error: tableErr(error.message, "clients") };
  return { ok: true, id };
}
export async function majClient(id: string, patch: Record<string, unknown>): Promise<ArmResult> {
  if (!id) return { ok: false, error: "Client introuvable." };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service indisponible." };
  const up: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  for (const k of ["nom", "telegramme", "discordId", "carteIdentite", "statut", "notes"]) if (k in patch) up[k] = s(patch[k], 2000);
  const { error } = await admin.from("ArmurerieClient").update(up).eq("id", id);
  if (error) return { ok: false, error: "Enregistrement impossible." };
  return { ok: true };
}
export async function supprimerClient(id: string): Promise<ArmResult> {
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service indisponible." };
  const { error } = await admin.from("ArmurerieClient").delete().eq("id", id);
  return error ? { ok: false, error: "Suppression impossible." } : { ok: true };
}

// ── Ventes (registre officiel — Décret N°2) ──────────────────────
export async function creerVente(d: { clientId?: string; acquereur: string; dateVente?: string; marque?: string; modele?: string; categorie?: string; numeroSerie?: string; vendeur?: string; telegramme?: string; prix?: number; notes?: string }): Promise<ArmResult> {
  if (!d.acquereur || d.acquereur.trim().length < 2) return { ok: false, error: "Nom de l'acquéreur requis (Décret N°2)." };
  if (!d.numeroSerie || d.numeroSerie.trim().length < 1) return { ok: false, error: "Le n° de série est obligatoire (Décret N°2)." };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service indisponible." };
  const id = newId("vte");
  const { error } = await admin.from("ArmurerieVente").insert({
    id, clientId: s(d.clientId, 60), acquereur: s(d.acquereur, 120),
    dateVente: s(d.dateVente, 40) || new Date().toLocaleDateString("fr-FR"),
    marque: s(d.marque, 80), modele: s(d.modele, 80), categorie: s(d.categorie, 60),
    numeroSerie: s(d.numeroSerie, 80), vendeur: s(d.vendeur, 120), telegramme: s(d.telegramme, 60),
    prix: Math.max(0, Math.round(Number(d.prix) || 0)), notes: s(d.notes, 1000), statut: "enregistree",
  });
  if (error) return { ok: false, error: tableErr(error.message, "ventes") };
  return { ok: true, id };
}
export async function majVente(id: string, patch: Record<string, unknown>): Promise<ArmResult> {
  if (!id) return { ok: false, error: "Vente introuvable." };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service indisponible." };
  const up: Record<string, unknown> = {};
  for (const k of ["acquereur", "dateVente", "marque", "modele", "categorie", "numeroSerie", "vendeur", "telegramme", "notes", "statut", "clientId"]) if (k in patch) up[k] = s(patch[k], 1000);
  if ("prix" in patch) up.prix = Math.max(0, Math.round(Number(patch.prix) || 0));
  const { error } = await admin.from("ArmurerieVente").update(up).eq("id", id);
  return error ? { ok: false, error: "Enregistrement impossible." } : { ok: true };
}
export async function supprimerVente(id: string): Promise<ArmResult> {
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service indisponible." };
  const { error } = await admin.from("ArmurerieVente").delete().eq("id", id);
  return error ? { ok: false, error: "Suppression impossible." } : { ok: true };
}

// ── Contrats de vente ────────────────────────────────────────────
export async function creerContrat(d: { clientId?: string; clientNom: string; clientDiscordId?: string; arme?: string; numeroSerie?: string; prix?: number; conditions?: string }): Promise<ArmResult> {
  if (!d.clientNom || d.clientNom.trim().length < 2) return { ok: false, error: "Indique le nom du client." };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service indisponible." };
  const id = newId("ctr");
  const { error } = await admin.from("ArmurerieContrat").insert({
    id, clientId: s(d.clientId, 60), clientNom: s(d.clientNom, 120), clientDiscordId: s(d.clientDiscordId, 40),
    arme: s(d.arme, 120), numeroSerie: s(d.numeroSerie, 80), prix: Math.max(0, Math.round(Number(d.prix) || 0)),
    conditions: s(d.conditions, 2000), statut: "brouillon",
  });
  if (error) return { ok: false, error: tableErr(error.message, "contrats") };
  return { ok: true, id };
}

// Envoie le contrat au client par message privé Discord (via le bot) et le marque « envoyé ».
export async function envoyerContrat(id: string): Promise<ArmResult> {
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service indisponible." };
  const { data, error } = await admin.from("ArmurerieContrat").select("*").eq("id", id).maybeSingle();
  if (error || !data) return { ok: false, error: "Contrat introuvable." };
  if (!data.clientDiscordId) return { ok: false, error: "Renseigne l'ID Discord du client pour l'envoi." };
  const cmd = await envoyerCommande("armurerie.contrat", {
    contratId: id, clientDiscordId: data.clientDiscordId, clientNom: data.clientNom,
    arme: data.arme, numeroSerie: data.numeroSerie, prix: data.prix, conditions: data.conditions,
  });
  if (!cmd.ok) return { ok: false, error: cmd.error };
  await admin.from("ArmurerieContrat").update({ statut: "envoye", envoyeAt: new Date().toISOString() }).eq("id", id);
  return { ok: true };
}
export async function marquerContrat(id: string, statut: "signe" | "refuse" | "brouillon"): Promise<ArmResult> {
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service indisponible." };
  const up: Record<string, unknown> = { statut };
  if (statut === "signe") up.signeAt = new Date().toISOString();
  const { error } = await admin.from("ArmurerieContrat").update(up).eq("id", id);
  return error ? { ok: false, error: "Enregistrement impossible." } : { ok: true };
}
export async function supprimerContrat(id: string): Promise<ArmResult> {
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service indisponible." };
  const { error } = await admin.from("ArmurerieContrat").delete().eq("id", id);
  return error ? { ok: false, error: "Suppression impossible." } : { ok: true };
}

function tableErr(msg: string, quoi: string): string {
  if (/does not exist|relation|Armurerie/i.test(msg)) return `La table des ${quoi} n'est pas encore créée — exécute armurerie-vh.sql dans Supabase.`;
  return "Enregistrement impossible pour le moment.";
}
