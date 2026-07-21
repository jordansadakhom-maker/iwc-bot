"use server";

// Générateur IA de documents officiels (rapport d'opération, ordre de mission,
// communiqué, lettre, avis de recherche) dans le ton western RDR2. Réutilise
// l'API Anthropic (comme l'assistant). Aucune donnée inventée imposée par le
// system prompt : si un détail manque, l'IA reste générale.

export type DocType = "rapport" | "ordre" | "communique" | "lettre" | "avis";
export type DocResult = { ok: boolean; texte?: string; error?: string };

const LIBELLE: Record<DocType, string> = {
  rapport: "Rapport d'opération",
  ordre: "Ordre de mission",
  communique: "Communiqué / annonce",
  lettre: "Lettre officielle",
  avis: "Avis de recherche (Wanted)",
};

const CONSIGNE: Record<DocType, string> = {
  rapport: "RAPPORT D'OPÉRATION. Structure : en-tête (date, nom de l'opération, rédacteur), déroulé des faits, résultat, pertes et butin éventuels, recommandations. Ton factuel et militaire.",
  ordre: "ORDRE DE MISSION. Structure : objectif, lieu, agents assignés, consignes précises, rémunération, signature du donneur d'ordre. Ton d'ordre clair et bref.",
  communique: "COMMUNIQUÉ officiel destiné à être affiché ou lu publiquement. Ton d'annonce solennelle et sobre.",
  lettre: "LETTRE OFFICIELLE. Formule d'appel et de politesse d'époque (« Monsieur », « Je vous prie d'agréer… »). Corps clair.",
  avis: "AVIS DE RECHERCHE (WANTED). Structure d'un avis du Far West : « AVIS DE RECHERCHE », nom/signalement du recherché, motif, prime offerte, mention « MORT OU VIF » si pertinent, autorité émettrice.",
};

export async function genererDocument(
  type: DocType,
  champs: { sujet: string; details: string; pole?: string; auteur?: string },
): Promise<DocResult> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { ok: false, error: "Le générateur IA n'est pas activé (ajoute ANTHROPIC_API_KEY sur Vercel)." };
  const sujet = String(champs.sujet || "").trim();
  if (sujet.length < 2) return { ok: false, error: "Indique un sujet / titre." };
  if (!LIBELLE[type]) return { ok: false, error: "Type de document inconnu." };

  const orga = champs.pole === "confrerie"
    ? "La Confrérie (le pôle clandestin de la maison)"
    : "Iron Wolf Company (compagnie de sécurité : escorte, chasse de prime, armurerie de Van Horn)";

  const system =
    "Tu es le secrétaire de la Iron Wolf Company, dans l'univers de Red Dead Redemption 2 (Far West américain, 1899, État de Louisiane). " +
    "Tu rédiges des documents officiels en FRANÇAIS, dans un ton western d'époque : crédible, sobre, sans aucune référence moderne (jamais d'email, téléphone, internet, dollars écrits « $ » façon moderne — écris « dollars »). " +
    "RÈGLE ABSOLUE : n'invente AUCUN fait précis (noms, montants, dates, lieux) qui ne t'est pas donné. Si un détail manque, reste général ou laisse un blanc « ____ » à compléter à la main. " +
    "Rends UNIQUEMENT le texte du document, prêt à être imprimé, sans commentaire, sans explication, sans balises Markdown. " +
    `Type demandé : ${CONSIGNE[type]}`;

  const prompt =
    `Organisation émettrice : ${orga}\n` +
    `Type de document : ${LIBELLE[type]}\n` +
    `Sujet / titre : ${sujet}\n` +
    (champs.auteur ? `Rédigé par : ${champs.auteur}\n` : "") +
    `Éléments à intégrer :\n${String(champs.details || "").trim() || "(aucun détail fourni — reste général, ne fabrique rien)"}\n\n` +
    "Rédige le document complet, prêt à imprimer.";

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: "claude-sonnet-5", max_tokens: 1600, system, messages: [{ role: "user", content: prompt }] }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      console.error("genererDocument:", res.status, t.slice(0, 200));
      return { ok: false, error: "Le générateur est momentanément indisponible. Réessaie dans un instant." };
    }
    const data = await res.json();
    const txt = (data?.content || []).filter((b: { type: string }) => b.type === "text").map((b: { text: string }) => b.text).join("").trim();
    if (!txt) return { ok: false, error: "Réponse vide — réessaie." };
    return { ok: true, texte: txt };
  } catch (e) {
    console.error("genererDocument:", (e as Error).message);
    return { ok: false, error: "Le générateur est injoignable pour le moment." };
  }
}
