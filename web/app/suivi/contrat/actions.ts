"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { verifierTokenSignature } from "@/lib/sign-token";

// Signature / refus de contrat d'opération par le CLIENT, via lien à jeton.
// PUBLIC : l'autorisation est le JETON (non devinable, expirable), pas une
// session. On écrit donc directement via service_role — jamais envoyerCommande
// (qui exige désormais une session côté équipe).

export type OffreContrat = {
  commanditaire: string | null; remuneration: string | null; categorie: string | null;
  objectif: string | null; lieu: string | null; conditions: string | null; sens: string | null;
};
export type ChargeOffre = { trouve: boolean; statut?: string; offre?: OffreContrat };
export type SignResult = { ok: boolean; statut?: string; error?: string };

function offreDe(c: Record<string, unknown>): OffreContrat {
  const s = (v: unknown) => (v == null ? null : String(v));
  return {
    commanditaire: s(c.commanditaire), remuneration: s(c.remuneration), categorie: s(c.categorie),
    objectif: s(c.objectif), lieu: s(c.lieu), conditions: s(c.conditions), sens: s(c.sens),
  };
}

async function chargerContrat(opId: string): Promise<{ commanditaire: string; statut: string; contrat: Record<string, unknown> } | null> {
  const admin = createAdminClient();
  if (!admin) return null;
  const { data, error } = await admin.from("Operation").select("id,contrat").eq("id", opId).maybeSingle();
  if (error || !data) return null;
  const c = (data as { contrat?: unknown }).contrat;
  if (!c || typeof c !== "object") return null;
  const rec = c as Record<string, unknown>;
  return { commanditaire: String(rec.commanditaire || "Client"), statut: String(rec.statut || ""), contrat: rec };
}

export async function chargerOffre(token: string): Promise<ChargeOffre> {
  const v = verifierTokenSignature(token);
  if (!v) return { trouve: false };
  const c = await chargerContrat(v.opId);
  if (!c) return { trouve: false };
  return { trouve: true, statut: c.statut, offre: offreDe(c.contrat) };
}

async function decider(token: string, signe: boolean): Promise<SignResult> {
  const v = verifierTokenSignature(token);
  if (!v) return { ok: false, error: "Lien invalide ou expiré." };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  const c = await chargerContrat(v.opId);
  if (!c) return { ok: false, error: "Contrat introuvable." };
  if (c.statut && c.statut !== "envoye") return { ok: false, statut: c.statut, error: c.statut === "signe" ? "Ce contrat est déjà signé." : c.statut === "refuse" ? "Ce contrat a déjà été refusé." : "Ce contrat n'est plus à signer." };

  const nouveau = signe ? "signe" : "refuse";
  // 1) Commande au bot (source de vérité de l'opération) — insertion directe
  //    (autorisée par le jeton), sans passer par envoyerCommande.
  const cmd = admin.from("CommandeWeb").insert({
    id: crypto.randomUUID(),
    type: signe ? "operation.contratSignerWeb" : "operation.contratRefuserWeb",
    payload: { operationId: v.opId, auteurNom: c.commanditaire },
    auteurNom: c.commanditaire, auteurId: null, statut: "nouveau",
  });
  const { error: e1 } = await cmd;
  if (e1) { console.error("decider contrat:", e1.message); return { ok: false, error: "Enregistrement impossible. Réessaie." }; }

  // 2) Notification à l'équipe (déduplicée par ref).
  try {
    await admin.from("Notification").upsert({
      id: crypto.randomUUID(), type: "contrat-statut",
      titre: `Contrat ${signe ? "signé" : "refusé"} par le client — ${c.commanditaire}`,
      lien: "/operations", clientNom: c.commanditaire, cibleId: v.opId,
      ref: `op-contrat-${v.opId}-${nouveau}`, createdAt: new Date().toISOString(),
    }, { onConflict: "ref", ignoreDuplicates: true });
  } catch { /* best-effort */ }

  return { ok: true, statut: nouveau };
}

export async function signerOffre(token: string): Promise<SignResult> { return decider(token, true); }
export async function refuserOffre(token: string): Promise<SignResult> { return decider(token, false); }
