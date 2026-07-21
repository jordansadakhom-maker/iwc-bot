"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { envoyerCommande } from "@/lib/commandes";

// Gestion des rendez-vous clients (pris sur le site) — trace conservée.
// Les demandes web vivent dans Supabase (table Rdv) ; on les met à jour
// directement côté serveur (le bot ne les écrase pas : il ne gère que les RDV
// venus de Discord).

export type CommResult = { ok: boolean; error?: string };

const STATUTS = ["nouveau", "confirme", "honore", "annule", "lapin", "cloture"];

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

// Clôture un rendez-vous : il quitte la liste active et bascule dans le JOURNAL
// DE BORD (avec son résultat, la date de clôture et l'auteur). Garde une trace
// totale sans encombrer l'agenda ni le salon Discord.
export async function cloturerRdv(id: string, resultat: string): Promise<CommResult> {
  if (!id) return { ok: false, error: "RDV introuvable." };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service indisponible." };
  const { data } = await admin.from("Rdv").select("paiement").eq("id", id).maybeSingle();
  const paiement = (data?.paiement && typeof data.paiement === "object" ? data.paiement : {}) as Record<string, unknown>;
  const { error } = await admin.from("Rdv").update({
    statut: "cloture",
    paiement: { ...paiement, resultat: String(resultat || "").slice(0, 1200), closedAt: new Date().toISOString(), closedBy: await auteurNom() },
  }).eq("id", id);
  if (error) { console.error("cloturerRdv:", error.message); return { ok: false, error: "Enregistrement impossible." }; }
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

// Lit le paiement JSON d'un RDV, applique un patch, réécrit. Renvoie le nouvel objet.
async function _patchPaiement(id: string, patch: Record<string, unknown>): Promise<CommResult> {
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service indisponible." };
  const { data, error: e1 } = await admin.from("Rdv").select("paiement").eq("id", id).maybeSingle();
  if (e1) return { ok: false, error: "RDV introuvable." };
  const paiement = (data?.paiement && typeof data.paiement === "object" ? data.paiement : {}) as Record<string, unknown>;
  const { error: e2 } = await admin.from("Rdv").update({ paiement: { ...paiement, ...patch } }).eq("id", id);
  if (e2) { console.error("_patchPaiement:", e2.message); return { ok: false, error: "Enregistrement impossible." }; }
  return { ok: true };
}

// Assigne des membres (et/ou un pôle) à un RDV : enregistre sur le RDV + demande
// au bot de pinguer / DM les concernés sur Discord.
export async function assignerRdv(
  id: string,
  membreIds: string[],
  membresNoms: string[],
  groupe: string | null,
  meta: { nom?: string | null; lieu?: string | null; creneau?: string | null; duree?: string | null },
): Promise<CommResult> {
  if (!id) return { ok: false, error: "RDV introuvable." };
  const ids = (Array.isArray(membreIds) ? membreIds : []).map(String).filter(Boolean).slice(0, 15);
  const g = groupe === "legal" || groupe === "illegal" ? groupe : null;
  if (!ids.length && !g) return { ok: false, error: "Choisis au moins une personne ou un pôle." };
  const r = await _patchPaiement(id, { assignes: membresNoms.slice(0, 15), assignesIds: ids, assignesGroupe: g });
  if (!r.ok) return r;
  // Ping Discord VISIBLE + MP (best-effort, via la file de commandes).
  await envoyerCommande("rdv.assigner", {
    membreIds: ids, groupe: g,
    rdvNom: meta.nom || null, rdvLieu: meta.lieu || null, rdvCreneau: meta.creneau || null, rdvDuree: meta.duree || null,
  });
  return { ok: true };
}

// Enregistre l'URL d'une photo du lieu du RDV (Supabase Storage).
export async function definirLieuPhotoRdv(id: string, url: string): Promise<CommResult> {
  if (!id) return { ok: false, error: "RDV introuvable." };
  if (!/^https?:\/\//.test(url || "")) return { ok: false, error: "Photo invalide." };
  return _patchPaiement(id, { lieuPhoto: url });
}
