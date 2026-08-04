"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { verifierTokenSignature } from "@/lib/sign-token";

// Signature / refus de contrat par le CLIENT, via lien à jeton. PUBLIC :
// l'autorisation est le JETON (non devinable, expirable), pas une session.
// Le jeton vise soit une OPÉRATION (id brut), soit un CONTRAT autonome (« ctr:… »).

export type OffreContrat = {
  commanditaire: string | null; remuneration: string | null; categorie: string | null;
  objectif: string | null; lieu: string | null; conditions: string | null; sens: string | null;
};
export type ChargeOffre = { trouve: boolean; statut?: string; offre?: OffreContrat };
export type SignResult = { ok: boolean; statut?: string; error?: string };

const s = (v: unknown) => (v == null ? null : String(v));

// Un token peut viser une OPÉRATION (id brut) ou un CONTRAT autonome (« ctr:<id> »).
function cibleDe(opId: string): { kind: "operation" | "contrat"; id: string } {
  return opId.startsWith("ctr:") ? { kind: "contrat", id: opId.slice(4) } : { kind: "operation", id: opId };
}

type Charge = { kind: "operation" | "contrat"; id: string; commanditaire: string; statut: string; offre: OffreContrat };

async function charger(opId: string): Promise<Charge | null> {
  const admin = createAdminClient();
  if (!admin) return null;
  const t = cibleDe(opId);

  if (t.kind === "contrat") {
    const { data, error } = await admin.from("Contrat").select("*").eq("id", t.id).maybeSingle();
    if (error || !data) return null;
    const c = data as Record<string, unknown>;
    const sig = c.signature && typeof c.signature === "object" ? (c.signature as Record<string, unknown>) : null;
    return {
      kind: "contrat", id: t.id,
      commanditaire: String(c.commanditaire || (sig?.commanditaire as string) || "Commanditaire"),
      statut: String(sig?.statut || ""),
      offre: { commanditaire: s(c.commanditaire), remuneration: s(c.remuneration), categorie: s(c.categorie), objectif: s(c.cible), lieu: null, conditions: s(c.motif), sens: "client_signe" },
    };
  }

  const { data, error } = await admin.from("Operation").select("id,contrat").eq("id", t.id).maybeSingle();
  if (error || !data) return null;
  const c = (data as { contrat?: unknown }).contrat;
  if (!c || typeof c !== "object") return null;
  const rec = c as Record<string, unknown>;
  return {
    kind: "operation", id: t.id,
    commanditaire: String(rec.commanditaire || "Client"), statut: String(rec.statut || ""),
    offre: { commanditaire: s(rec.commanditaire), remuneration: s(rec.remuneration), categorie: s(rec.categorie), objectif: s(rec.objectif), lieu: s(rec.lieu), conditions: s(rec.conditions), sens: s(rec.sens) },
  };
}

export async function chargerOffre(token: string): Promise<ChargeOffre> {
  const v = verifierTokenSignature(token);
  if (!v) return { trouve: false };
  const c = await charger(v.opId);
  if (!c) return { trouve: false };
  return { trouve: true, statut: c.statut, offre: c.offre };
}

async function decider(token: string, signe: boolean): Promise<SignResult> {
  const v = verifierTokenSignature(token);
  if (!v) return { ok: false, error: "Lien invalide ou expiré." };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  const c = await charger(v.opId);
  if (!c) return { ok: false, error: "Contrat introuvable." };
  if (c.statut && c.statut !== "envoye") return { ok: false, statut: c.statut, error: c.statut === "signe" ? "Ce contrat est déjà signé." : c.statut === "refuse" ? "Ce contrat a déjà été refusé." : "Ce contrat n'est plus à signer." };

  const nouveau = signe ? "signe" : "refuse";
  // Commande au bot (source de vérité) — insertion directe (autorisée par le jeton).
  const type = c.kind === "contrat"
    ? (signe ? "contrat.signerWeb" : "contrat.refuserWeb")
    : (signe ? "operation.contratSignerWeb" : "operation.contratRefuserWeb");
  const payload = c.kind === "contrat" ? { contratId: c.id, auteurNom: c.commanditaire } : { operationId: c.id, auteurNom: c.commanditaire };
  const { error: e1 } = await admin.from("CommandeWeb").insert({ id: crypto.randomUUID(), type, payload, auteurNom: c.commanditaire, auteurId: null, statut: "nouveau" });
  if (e1) { console.error("decider contrat:", e1.message); return { ok: false, error: "Enregistrement impossible. Réessaie." }; }

  // Notification à l'équipe (déduplicée par ref).
  try {
    await admin.from("Notification").upsert({
      id: crypto.randomUUID(), type: "contrat-statut",
      titre: `Contrat ${signe ? "signé" : "refusé"} par le client — ${c.commanditaire}`,
      lien: "/operations", clientNom: c.commanditaire, cibleId: c.id,
      ref: `${c.kind}-contrat-${c.id}-${nouveau}`, createdAt: new Date().toISOString(),
    }, { onConflict: "ref", ignoreDuplicates: true });
  } catch { /* best-effort */ }

  return { ok: true, statut: nouveau };
}

export async function signerOffre(token: string): Promise<SignResult> { return decider(token, true); }
export async function refuserOffre(token: string): Promise<SignResult> { return decider(token, false); }
