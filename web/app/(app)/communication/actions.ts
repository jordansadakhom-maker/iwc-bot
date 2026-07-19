"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// Gestion des rendez-vous clients (pris sur le site) — trace conservée.
// Les demandes web vivent dans Supabase (table Rdv) ; on les met à jour
// directement côté serveur (le bot ne les écrase pas : il ne gère que les RDV
// venus de Discord).

export type CommResult = { ok: boolean; error?: string };

const STATUTS = ["nouveau", "confirme", "honore", "annule", "lapin"];

async function auteurNom(): Promise<string> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return "Équipe";
    const meta = (user.user_metadata || {}) as Record<string, unknown>;
    let nom = (meta.full_name || meta.name || meta.user_name || "Membre") as string;
    const discordId = (meta.provider_id || meta.sub || "") as string;
    const admin = createAdminClient();
    if (discordId && admin) {
      const { data } = await admin.from("Membre").select("nomIC").eq("id", String(discordId)).maybeSingle();
      if (data?.nomIC) nom = data.nomIC as string;
    }
    return String(nom).slice(0, 120);
  } catch { return "Équipe"; }
}

export async function majStatutRdv(id: string, statut: string): Promise<CommResult> {
  if (!id) return { ok: false, error: "RDV introuvable." };
  if (!STATUTS.includes(statut)) return { ok: false, error: "Statut invalide." };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service indisponible." };
  const { error } = await admin.from("Rdv").update({ statut }).eq("id", id);
  if (error) { console.error("majStatutRdv:", error.message); return { ok: false, error: "Enregistrement impossible." }; }
  return { ok: true };
}

export async function repondreRdv(id: string, texte: string): Promise<CommResult> {
  const t = (texte || "").trim();
  if (!id) return { ok: false, error: "RDV introuvable." };
  if (t.length < 1) return { ok: false, error: "Écris une réponse." };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service indisponible." };
  // Lit le paiement actuel, ajoute la réponse à la trace, réécrit.
  const { data, error: e1 } = await admin.from("Rdv").select("paiement").eq("id", id).maybeSingle();
  if (e1) return { ok: false, error: "RDV introuvable." };
  const paiement = (data?.paiement && typeof data.paiement === "object" ? data.paiement : {}) as Record<string, unknown>;
  const reponses = Array.isArray(paiement.reponses) ? (paiement.reponses as unknown[]) : [];
  reponses.push({ texte: t.slice(0, 2000), par: await auteurNom(), at: new Date().toISOString() });
  const { error: e2 } = await admin.from("Rdv").update({ paiement: { ...paiement, reponses } }).eq("id", id);
  if (e2) { console.error("repondreRdv:", e2.message); return { ok: false, error: "Enregistrement impossible." }; }
  return { ok: true };
}
