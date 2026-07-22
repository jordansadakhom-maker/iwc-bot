"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { envoyerCommande } from "@/lib/commandes";
import { envoyerEmail } from "@/lib/email";

// Télégrammes : répondre (le bot livre le MP au client + garde la trace) et
// créer automatiquement un RDV à partir d'un télégramme contenant lieu/prénom/heure.

export type TgResult = { ok: boolean; error?: string; info?: string };

export async function repondreTelegramme(rdvId: string, texte: string): Promise<TgResult> {
  const t = (texte || "").trim();
  if (!rdvId) return { ok: false, error: "Télégramme introuvable." };
  if (t.length < 1) return { ok: false, error: "Écris une réponse." };
  // On ATTEND le verdict du bot pour CONFIRMER si le MP est réellement arrivé au
  // client (au lieu d'un « livré » optimiste).
  const r = await envoyerCommande("telegramme.repondre", { rdvId, texte: t.slice(0, 2000) }, { attendre: true, timeoutMs: 12000 });
  if (!r.ok) return { ok: false, error: r.error };
  if (r.enAttente) return { ok: true, info: "Réponse transmise — livraison au client en cours (~30 s)." };
  return { ok: true, info: r.message || "Réponse transmise au client." };
}

// Réponse à un télégramme ENVOYÉ DEPUIS LE SITE (pas de MP Discord possible) :
// on conserve la trace ; l'équipe recontacte via le moyen indiqué par l'expéditeur.
export async function repondreTelegrammeWeb(idPrefixe: string, texte: string, parNom: string): Promise<TgResult> {
  const t = (texte || "").trim();
  const id = (idPrefixe || "").replace(/^web-/, "");
  if (!id) return { ok: false, error: "Télégramme introuvable." };
  if (t.length < 1) return { ok: false, error: "Écris une réponse." };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service indisponible." };
  const { data, error } = await admin.from("TelegrammeWeb").select("reponses,contact").eq("id", id).maybeSingle();
  if (error || !data) return { ok: false, error: "Télégramme introuvable." };
  const row = data as { reponses?: unknown[]; contact?: string };
  const reponses = Array.isArray(row.reponses) ? row.reponses : [];
  reponses.push({ texte: t.slice(0, 2000), par: (parNom || "Équipe").slice(0, 120), at: Date.now() });
  const { error: e2 } = await admin.from("TelegrammeWeb").update({ reponses }).eq("id", id);
  if (e2) return { ok: false, error: "Enregistrement impossible." };
  // On livre la réponse par le canal laissé par l'expéditeur :
  //   • Discord → le bot retrouve le pseudo et envoie un MP.
  //   • E-mail  → on envoie un e-mail (si le service est configuré sur Vercel).
  //   • Sinon   → trace conservée ; le client peut la lire sur « Suivre ma demande ».
  const contact = String(row.contact || "");
  const m = contact.match(/discord\s*[:：]\s*(.+)$/i);
  if (m && m[1].trim()) {
    const r = await envoyerCommande("telegramme.mpDiscord", { pseudo: m[1].trim(), texte: t.slice(0, 2000), de: parNom || "Iron Wolf Company" }, { attendre: true, timeoutMs: 12000 });
    if (r.enAttente) return { ok: true, info: "Réponse conservée — livraison Discord en cours…" };
    if (r.ok) return { ok: true, info: r.message || "✅ Réponse livrée au client en MP Discord." };
    return { ok: true, info: `${r.error || "MP Discord non livré"} — réponse gardée en trace.` };
  }
  const em = contact.match(/email\s*[:：]\s*([^\s]+@[^\s]+)/i) || contact.match(/([^\s]+@[^\s]+\.[^\s]+)/);
  if (em && em[1]) {
    const corps = `Bonjour,\n\nTu as envoyé un télégramme à la Iron Wolf Company. Voici notre réponse :\n\n${t}\n\n— ${parNom || "Iron Wolf Company"}\n\n(Tu peux aussi suivre ta demande sur notre site, page « Suivre ma demande ».)`;
    const res = await envoyerEmail(em[1].trim(), "Réponse à ton télégramme — Iron Wolf Company", corps);
    if (res.ok) return { ok: true, info: "✅ Réponse envoyée par e-mail au client (trace conservée)." };
    if (res.reason === "non configuré") return { ok: true, info: "Réponse gardée en trace. L'envoi d'e-mail n'est pas encore configuré — le client peut la lire sur « Suivre ma demande »." };
    return { ok: true, info: `Réponse gardée en trace (e-mail non envoyé : ${res.reason}). Le client peut la lire sur « Suivre ma demande ».` };
  }
  return { ok: true, info: "Réponse conservée (trace). Le client peut la lire sur « Suivre ma demande » via son nom." };
}

// ── Extraction lieu / heure depuis le texte d'un télégramme ──
const LIEUX = [
  "Valentine", "Strawberry", "Rhodes", "Saint-Denis", "Saint Denis", "Blackwater", "Annesburg",
  "Van Horn", "Tumbleweed", "Armadillo", "Emerald Ranch", "Lagras", "Colter", "Manzanita",
  "Wallace Station", "Riggs Station", "Flatneck", "Roanoke", "Tall Trees", "Thieves Landing",
];
function extraireLieu(txt: string): string | null {
  const bas = txt.toLowerCase();
  for (const l of LIEUX) if (bas.includes(l.toLowerCase())) return l;
  const m = txt.match(/lieu\s*[:=]\s*([^\n.,;]{2,60})/i);
  return m ? m[1].trim() : null;
}
function extraireHeure(txt: string): string | null {
  const m =
    txt.match(/\b(\d{1,2}\s?[hH]\s?\d{2})\b/) ||
    txt.match(/\b(\d{1,2}\s?[hH])\b/) ||
    txt.match(/\b(\d{1,2}:\d{2})\b/) ||
    txt.match(/(?:à|a|vers)\s+(\d{1,2}(?:\s?[hH:]\s?\d{2})?)/);
  return m ? m[1].replace(/\s+/g, "").trim() : null;
}

// Prévisualise ce qui serait extrait (pour l'UI, sans rien créer).
export async function apercuRdvTelegramme(clientNom: string, texteMessages: string): Promise<{ lieu: string | null; heure: string | null; prenom: string }> {
  const t = texteMessages || "";
  return { lieu: extraireLieu(t), heure: extraireHeure(t), prenom: clientNom || "Client" };
}

export async function creerRdvDepuisTelegramme(
  telegrammeId: string,
  clientNom: string,
  texteMessages: string,
): Promise<TgResult> {
  if (!telegrammeId) return { ok: false, error: "Télégramme introuvable." };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service indisponible." };

  const lieu = extraireLieu(texteMessages || "");
  const heure = extraireHeure(texteMessages || "");
  const objet = "Rendez-vous (télégramme)";
  const id = `tg-${telegrammeId}`;

  const { error } = await admin.from("Rdv").upsert(
    {
      id,
      nomRP: (clientNom || "Client").slice(0, 120),
      type: objet,
      lieu,
      creneau: heure,
      statut: "nouveau",
      paiement: { source: "telegramme", telegrammeId, message: (texteMessages || "").slice(0, 1000), lieuExtrait: lieu, heureExtraite: heure },
      createdAt: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
  if (error) { console.error("creerRdvDepuisTelegramme:", error.message); return { ok: false, error: "Création du RDV impossible." }; }

  // Marque le télégramme côté bot (survit à la resync).
  await envoyerCommande("telegramme.marquerRdv", { rdvId: telegrammeId });

  const details = [lieu ? `lieu : ${lieu}` : null, heure ? `heure : ${heure}` : null].filter(Boolean).join(" · ");
  return { ok: true, info: `RDV créé pour ${clientNom || "le client"}${details ? ` (${details})` : ""}. Il apparaît dans les rendez-vous.` };
}
