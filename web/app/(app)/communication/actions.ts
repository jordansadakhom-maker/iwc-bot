"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { envoyerCommande } from "@/lib/commandes";
import { envoyerEmail } from "@/lib/email";
import { ajusterCoffre, creerFacture } from "@/app/(app)/finances/actions";

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

export async function repondreRdv(id: string, texte: string): Promise<CommResult & { info?: string }> {
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
  const par = await auteurNom();
  reponses.push({ texte: t.slice(0, 2000), par, at: new Date().toISOString() });
  const { error: e2 } = await admin.from("Rdv").update({ paiement: { ...paiement, reponses } }).eq("id", id);
  if (e2) { console.error("repondreRdv:", e2.message); return { ok: false, error: "Enregistrement impossible." }; }
  // Livraison au client via le contact laissé (comme pour les télégrammes) :
  //   • Discord → le bot envoie un MP.  • E-mail → envoi direct.  • Sinon → trace
  //     seule, lisible par le client sur « Suivre ma demande ».
  return { ok: true, info: await livrerReponseClient(String(paiement.contact || ""), t, par) };
}

// Livre une réponse au client via le canal de contact d'un RDV. Best-effort :
// renvoie un message d'info pour l'UI, ne jette jamais.
async function livrerReponseClient(contact: string, texte: string, parNom: string): Promise<string> {
  const t = texte.slice(0, 2000);
  const md = contact.match(/discord\s*[:：]\s*(.+)$/i);
  if (md && md[1].trim()) {
    const r = await envoyerCommande("telegramme.mpDiscord", { pseudo: md[1].trim(), texte: t, de: parNom || "Iron Wolf Company" }, { attendre: true, timeoutMs: 12000 });
    if (r.enAttente) return "Réponse conservée — livraison Discord en cours…";
    if (r.ok) return r.message || "✅ Réponse livrée au client en MP Discord.";
    return `${r.error || "MP Discord non livré"} — réponse gardée en trace.`;
  }
  const em = contact.match(/email\s*[:：]\s*([^\s]+@[^\s]+)/i) || contact.match(/([^\s]+@[^\s]+\.[^\s]+)/);
  if (em && em[1]) {
    const corps = `Bonjour,\n\nAu sujet de ta demande de rendez-vous auprès de la Iron Wolf Company :\n\n${t}\n\n— ${parNom || "Iron Wolf Company"}\n\n(Tu peux aussi suivre ta demande sur notre site, page « Suivre ma demande ».)`;
    const res = await envoyerEmail(em[1].trim(), "Réponse à ta demande de rendez-vous — Iron Wolf Company", corps);
    if (res.ok) return "✅ Réponse envoyée par e-mail au client (trace conservée).";
    if (res.reason === "non configuré") return "Réponse gardée en trace. L'e-mail n'est pas configuré — le client peut la lire sur « Suivre ma demande ».";
    return `Réponse gardée en trace (e-mail non envoyé : ${res.reason}). Le client peut la lire sur « Suivre ma demande ».`;
  }
  return "Réponse conservée (trace). Le client peut la lire sur « Suivre ma demande ».";
}

// Replanifie un RDV depuis le site : met à jour le créneau et/ou le lieu, et
// garde une trace horodatée dans le fil (paiement.reponses). Entièrement côté
// site (le bot n'écrase pas les RDV web/télégramme).
export async function replanifierRdv(id: string, creneau: string, lieu: string): Promise<CommResult & { info?: string }> {
  if (!id) return { ok: false, error: "RDV introuvable." };
  const c = (creneau || "").trim();
  const l = (lieu || "").trim();
  if (!c && !l) return { ok: false, error: "Indique un nouveau créneau ou un nouveau lieu." };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service indisponible." };
  const { data, error: e1 } = await admin.from("Rdv").select("paiement").eq("id", id).maybeSingle();
  if (e1) return { ok: false, error: "RDV introuvable." };
  const paiement = (data?.paiement && typeof data.paiement === "object" ? data.paiement : {}) as Record<string, unknown>;
  const reponses = Array.isArray(paiement.reponses) ? (paiement.reponses as unknown[]) : [];
  const parts = [c ? `créneau → ${c}` : null, l ? `lieu → ${l}` : null].filter(Boolean).join(" · ");
  const par = await auteurNom();
  reponses.push({ texte: `📅 Replanifié (${parts})`, par, at: new Date().toISOString() });
  const patch: Record<string, unknown> = { paiement: { ...paiement, reponses } };
  if (c) patch.creneau = c.slice(0, 200);
  if (l) patch.lieu = l.slice(0, 200);
  const { error: e2 } = await admin.from("Rdv").update(patch).eq("id", id);
  if (e2) { console.error("replanifierRdv:", e2.message); return { ok: false, error: "Enregistrement impossible." }; }
  // Prévient le client du changement (MP Discord / e-mail selon son contact).
  const info = await livrerReponseClient(String(paiement.contact || ""), `📅 Ton rendez-vous a été replanifié : ${parts}.`, par);
  return { ok: true, info };
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

// Encaisse le paiement d'un RDV (client ayant réglé sa prestation), depuis le
// site — calque l'encaissement Discord (rdvp_encaisser) : marque le paiement sur
// le RDV → crédite le coffre commun → génère une facture. Réutilise les chemins
// financiers EXISTANTS (ajusterCoffre / creerFacture) : reflet instantané + le
// bot reste la source de vérité (coffre & facture), donc AUCUNE divergence.
// Anti-doublon : un RDV déjà encaissé ne peut pas l'être une seconde fois.
export async function encaisserRdv(id: string, montant: number, note: string): Promise<CommResult & { solde?: number }> {
  if (!id) return { ok: false, error: "RDV introuvable." };
  const m = Math.round(Number(montant) || 0);
  if (m <= 0) return { ok: false, error: "Montant invalide." };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service indisponible." };
  const { data, error: e1 } = await admin.from("Rdv").select("paiement,nomRP,type").eq("id", id).maybeSingle();
  if (e1 || !data) return { ok: false, error: "RDV introuvable." };
  const row = data as { paiement?: unknown; nomRP?: string | null; type?: string | null };
  const paiement = (row.paiement && typeof row.paiement === "object" ? row.paiement : {}) as Record<string, unknown>;
  if (Number(paiement.montant) > 0) return { ok: false, error: `Déjà encaissé : $${Number(paiement.montant).toLocaleString("fr-FR")}.` };
  const par = await auteurNom();
  const nomRP = String(row.nomRP || "Client");
  const typeRdv = String(row.type || "RDV");
  const n = (note || "").trim().slice(0, 500);
  // 1) Marque le paiement + trace dans le fil.
  const reponses = Array.isArray(paiement.reponses) ? (paiement.reponses as unknown[]) : [];
  reponses.push({ texte: `💰 Encaissé : $${m.toLocaleString("fr-FR")}${n ? ` — ${n}` : ""}`, par, at: new Date().toISOString() });
  const nouveau = { ...paiement, montant: m, par, at: new Date().toISOString(), note: n || null, facture: null, reponses };
  const { error: e2 } = await admin.from("Rdv").update({ paiement: nouveau }).eq("id", id);
  if (e2) { console.error("encaisserRdv:", e2.message); return { ok: false, error: "Enregistrement impossible." }; }
  // 2) Crédite le coffre commun (reflet instantané + commande bot = source de vérité).
  let solde: number | undefined;
  try { const rc = await ajusterCoffre("commun", m, "depot"); if (rc.ok) solde = rc.solde; } catch { /* best-effort */ }
  // 3) Génère une facture (via le bot, exactement comme l'encaissement Discord).
  try { await creerFacture({ objet: `RDV — ${nomRP}`, montant: m, clientNom: nomRP, type: `RDV — ${typeRdv}`, remuneration: `$${m}` }); } catch { /* best-effort */ }
  return { ok: true, solde };
}

// Demande l'avis du client après un RDV honoré (satisfaction) — depuis le site.
// Envoie un message d'invitation au client via son contact (MP Discord / e-mail)
// et garde la trace. Calque la « satisfaction request » de Discord.
export async function demanderAvisRdv(id: string): Promise<CommResult & { info?: string }> {
  if (!id) return { ok: false, error: "RDV introuvable." };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service indisponible." };
  const { data, error: e1 } = await admin.from("Rdv").select("paiement").eq("id", id).maybeSingle();
  if (e1 || !data) return { ok: false, error: "RDV introuvable." };
  const paiement = ((data as { paiement?: unknown }).paiement && typeof (data as { paiement?: unknown }).paiement === "object" ? (data as { paiement?: unknown }).paiement : {}) as Record<string, unknown>;
  const par = await auteurNom();
  const reponses = Array.isArray(paiement.reponses) ? (paiement.reponses as unknown[]) : [];
  reponses.push({ texte: "⭐ Demande d'avis envoyée au client.", par, at: new Date().toISOString() });
  const { error: e2 } = await admin.from("Rdv").update({ paiement: { ...paiement, reponses, avisDemande: new Date().toISOString() } }).eq("id", id);
  if (e2) { console.error("demanderAvisRdv:", e2.message); return { ok: false, error: "Enregistrement impossible." }; }
  const msg = "Merci d'avoir fait appel à la Iron Wolf Company ! Es-tu satisfait(e) de la prestation ? Réponds simplement à ce message — ton retour nous aide à nous améliorer.";
  const info = await livrerReponseClient(String(paiement.contact || ""), msg, par);
  return { ok: true, info };
}

// Enregistre l'URL d'une photo du lieu du RDV (Supabase Storage).
export async function definirLieuPhotoRdv(id: string, url: string): Promise<CommResult> {
  if (!id) return { ok: false, error: "RDV introuvable." };
  if (!/^https?:\/\//.test(url || "")) return { ok: false, error: "Photo invalide." };
  return _patchPaiement(id, { lieuPhoto: url });
}
