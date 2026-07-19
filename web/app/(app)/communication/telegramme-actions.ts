"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { envoyerCommande } from "@/lib/commandes";

// Télégrammes : répondre (le bot livre le MP au client + garde la trace) et
// créer automatiquement un RDV à partir d'un télégramme contenant lieu/prénom/heure.

export type TgResult = { ok: boolean; error?: string; info?: string };

export async function repondreTelegramme(rdvId: string, texte: string): Promise<TgResult> {
  const t = (texte || "").trim();
  if (!rdvId) return { ok: false, error: "Télégramme introuvable." };
  if (t.length < 1) return { ok: false, error: "Écris une réponse." };
  const r = await envoyerCommande("telegramme.repondre", { rdvId, texte: t.slice(0, 2000) });
  if (!r.ok) return { ok: false, error: r.error };
  return { ok: true, info: "Réponse transmise — elle est livrée au client en message privé (~30 s)." };
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
  const { data, error } = await admin.from("TelegrammeWeb").select("reponses").eq("id", id).maybeSingle();
  if (error || !data) return { ok: false, error: "Télégramme introuvable." };
  const reponses = Array.isArray((data as { reponses?: unknown[] }).reponses) ? ((data as { reponses: unknown[] }).reponses) : [];
  reponses.push({ texte: t.slice(0, 2000), par: (parNom || "Équipe").slice(0, 120), at: Date.now() });
  const { error: e2 } = await admin.from("TelegrammeWeb").update({ reponses }).eq("id", id);
  if (e2) return { ok: false, error: "Enregistrement impossible." };
  return { ok: true, info: "Réponse conservée (trace). Recontacte l'expéditeur via son moyen de contact." };
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
