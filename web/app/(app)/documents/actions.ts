"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { envoyerCommande, type CommandeResult } from "@/lib/commandes";

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

const SYSTEME_BASE =
  "Tu es le secrétaire de la Iron Wolf Company, dans l'univers de Red Dead Redemption 2 (Far West, 1899, Louisiane). " +
  "Tu rédiges en FRANÇAIS, ton western d'époque, sobre et crédible, sans aucune référence moderne. " +
  "RÈGLE ABSOLUE : n'invente AUCUN fait précis (noms, montants, dates, lieux) non fourni ; laisse « ____ » si un détail manque. " +
  "Rends UNIQUEMENT le texte du document, prêt à imprimer, sans commentaire ni balises.";

// Lecture IA d'une CAPTURE : identifie de quoi il s'agit et rédige le document
// correspondant à partir de son contenu réel.
async function _visionDoc(url: string, userText: string, maxTokens = 1600): Promise<DocResult> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { ok: false, error: "Le générateur IA n'est pas activé (ANTHROPIC_API_KEY manquante)." };
  if (!/^https?:\/\//.test(String(url || ""))) return { ok: false, error: "Image invalide." };
  try {
    const img = await fetch(url);
    if (!img.ok) return { ok: false, error: "Image inaccessible." };
    const ct = img.headers.get("content-type") || "";
    const media = /png/i.test(ct) ? "image/png" : /webp/i.test(ct) ? "image/webp" : /gif/i.test(ct) ? "image/gif" : "image/jpeg";
    const b64 = Buffer.from(await img.arrayBuffer()).toString("base64");
    if (!b64 || b64.length > 6_000_000) return { ok: false, error: "Image trop lourde ou illisible." };
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-5", max_tokens: maxTokens,
        system: SYSTEME_BASE + " On te fournit une CAPTURE D'ÉCRAN : identifie de quoi il s'agit (ordre, rapport, liste, message, avis de recherche, note…) et rédige le document officiel correspondant en repartant FIDÈLEMENT de ce qui est visible. Ne recopie pas l'interface, garde le fond.",
        messages: [{ role: "user", content: [
          { type: "image", source: { type: "base64", media_type: media, data: b64 } },
          { type: "text", text: userText },
        ] }],
      }),
    });
    if (!res.ok) { const t = await res.text().catch(() => ""); console.error("_visionDoc:", res.status, t.slice(0, 200)); return { ok: false, error: "Lecture impossible pour le moment." }; }
    const data = await res.json();
    const txt = (data?.content || []).filter((b: { type: string }) => b.type === "text").map((b: { text: string }) => b.text).join("").trim();
    if (!txt) return { ok: false, error: "Réponse vide — réessaie." };
    return { ok: true, texte: txt };
  } catch (e) { console.error("_visionDoc:", (e as Error).message); return { ok: false, error: "Lecture injoignable." }; }
}

export async function genererDepuisCapture(url: string, pole?: string): Promise<DocResult> {
  const orga = pole === "confrerie" ? "La Confrérie" : "Iron Wolf Company";
  return _visionDoc(url, `Organisation émettrice : ${orga}. Analyse cette capture et rédige, en français et dans le ton d'époque, le document officiel qui lui correspond — prêt à imprimer.`, 1600);
}

// Rapport de mission IMMERSIF à partir d'une opération terminée (faits réels de
// la base, style enrichi mais AUCUN fait inventé).
export async function genererRapportMission(operationId: string): Promise<DocResult> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { ok: false, error: "Le générateur IA n'est pas activé (ANTHROPIC_API_KEY manquante)." };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service indisponible." };
  const { data, error } = await admin.from("Operation").select("*").eq("id", operationId).maybeSingle();
  if (error || !data) return { ok: false, error: "Opération introuvable." };
  const o = data as Record<string, unknown>;
  const s = (v: unknown) => String(v ?? "").trim();
  const faits: Record<string, string> = {
    "Opération": s(o.cible), "Type": s(o.categorie) || s(o.type), "Objectif": s(o.objectif),
    "Lieu": s(o.lieu), "Résultat": s(o.resultat), "Butin": s(o.butin), "Pertes": s(o.pertes),
    "Débrief": s(o.debrief), "Prime": s(o.prime), "Chef": s(o.createurNom),
  };
  const bloc = Object.entries(faits).filter(([, v]) => v).map(([k, v]) => `${k} : ${v}`).join("\n") || "(peu de détails renseignés — reste sobre)";
  const orga = s(o.pole) === "illegal" ? "La Confrérie" : "Iron Wolf Company";
  const system = SYSTEME_BASE + " Type demandé : RAPPORT DE MISSION immersif — en-tête (organisation, opération, date « ____ » si absente), récit du déroulé à la première personne du pluriel (« nous »), bilan (résultat, pertes, butin), et conclusion. Style vivant et immersif MAIS n'ajoute AUCUN fait qui ne figure pas ci-dessous : enrichis le style, jamais les faits.";
  const prompt = `Organisation : ${orga}\nFAITS RÉELS de l'opération :\n${bloc}\n\nRédige le rapport de mission complet, prêt à imprimer.`;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: "claude-sonnet-5", max_tokens: 1600, system, messages: [{ role: "user", content: prompt }] }),
    });
    if (!res.ok) { const t = await res.text().catch(() => ""); console.error("genererRapportMission:", res.status, t.slice(0, 200)); return { ok: false, error: "Générateur momentanément indisponible." }; }
    const d = await res.json();
    const txt = (d?.content || []).filter((b: { type: string }) => b.type === "text").map((b: { text: string }) => b.text).join("").trim();
    if (!txt) return { ok: false, error: "Réponse vide — réessaie." };
    return { ok: true, texte: txt };
  } catch (e) { console.error("genererRapportMission:", (e as Error).message); return { ok: false, error: "Générateur injoignable." }; }
}

// Envoi du document à quelqu'un en message privé Discord (via la file de commandes).
export async function envoyerDocument(clientDiscordId: string, titre: string, texte: string): Promise<CommandeResult> {
  const did = String(clientDiscordId || "").trim();
  if (!did) return { ok: false, error: "Renseigne l'ID Discord du destinataire." };
  if (!texte || texte.trim().length < 5) return { ok: false, error: "Le document est vide." };
  return envoyerCommande("document.envoyer", { clientDiscordId: did, titre: String(titre || "Document").slice(0, 120), texte: texte.slice(0, 3500) }, { attendre: true });
}
