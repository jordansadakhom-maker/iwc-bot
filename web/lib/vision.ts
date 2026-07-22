import "server-only";

// ── OCRService — lecture d'image / capture / PDF par l'IA (vision) ──
//
// Cœur partagé de la reconnaissance visuelle du site : télécharge le fichier,
// l'envoie en base64 à Claude (indépendant de la version d'API) et renvoie le
// texte produit. Réutilisé par le module Chasse (et disponible pour tout futur
// besoin d'OCR). Même moteur que la lecture de coffre de l'Armurerie.
//
// ⚠️ server-only : ne jamais importer dans un composant client.

const s = (v: unknown, max = 120) => String(v ?? "").trim().slice(0, max);

export type VisionResult = { ok: boolean; txt?: string; error?: string };

export async function lireImageVision(url: string, system: string, userText: string, maxTokens = 400): Promise<VisionResult> {
  if (!/^https?:\/\//.test(String(url || ""))) return { ok: false, error: "Photo invalide." };
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { ok: false, error: "Lecture automatique indisponible (variable ANTHROPIC_API_KEY absente sur Vercel)." };
  try {
    const img = await fetch(url);
    if (!img.ok) return { ok: false, error: "Fichier inaccessible." };
    const ct = img.headers.get("content-type") || "";
    // PDF détecté par content-type OU extension (Supabase sert parfois octet-stream).
    const isPdf = /application\/pdf/i.test(ct) || /\.pdf(\?|$)/i.test(url);
    const media = /png/i.test(ct) ? "image/png" : /webp/i.test(ct) ? "image/webp" : /gif/i.test(ct) ? "image/gif" : "image/jpeg";
    const b64 = Buffer.from(await img.arrayBuffer()).toString("base64");
    const cap = isPdf ? 24_000_000 : 6_000_000; // PDF plus permissif (requête API ≤ 32 Mo)
    if (!b64 || b64.length > cap) return { ok: false, error: "Fichier trop lourd ou illisible." };
    const bloc = isPdf
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } }
      : { type: "image", source: { type: "base64", media_type: media, data: b64 } };
    const effMax = isPdf ? Math.max(maxTokens, 2048) : maxTokens;
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-5", max_tokens: effMax, system,
        messages: [{ role: "user", content: [bloc, { type: "text", text: userText }] }],
      }),
    });
    if (!res.ok) { const t = await res.text().catch(() => ""); console.error("lireImageVision:", res.status, t.slice(0, 200)); return { ok: false, error: "Lecture impossible pour le moment." }; }
    const data = await res.json();
    const txt = ((data?.content || []) as { type: string; text?: string }[]).filter((b) => b.type === "text").map((b) => b.text || "").join("");
    return { ok: true, txt };
  } catch (e) { console.error("lireImageVision:", (e as Error).message); return { ok: false, error: "Lecture injoignable pour le moment." }; }
}

// Lit une capture d'inventaire / coffre / panneau de gestion et relève chaque
// ressource avec sa QUANTITÉ EN STOCK. Renvoie une liste corrigeable — le site
// affiche un aperçu que l'utilisateur valide (ou corrige) avant d'appliquer.
export type LigneStock = { nom: string; quantite: number };

export async function lireStockDepuisImage(url: string): Promise<{ ok: boolean; lignes?: LigneStock[]; error?: string }> {
  const r = await lireImageVision(
    url,
    "Tu regardes une capture d'écran qui liste des matières / ressources avec leur STOCK. Ça peut être : (a) un coffre/inventaire de jeu (RDR2/RedM) où le stock est noté « x123 », ou (b) un panneau web de gestion où le stock est noté « Stock : 123 », « 123 en stock », ou un simple nombre à côté du nom. Contexte : ressources de CHASSE (viandes de cerf/bison/sanglier/lapin/dinde/canard…, peaux, plumes, graisse, cornes, carcasses, etc.). Pour CHAQUE ligne, relève le NOM exact de la ressource et sa QUANTITÉ EN STOCK. Réponds UNIQUEMENT par un JSON compact, sans texte autour : {\"lignes\":[{\"nom\":\"Nom exact\",\"quantite\":123}]}. Recopie le nom EXACTEMENT. IMPORTANT : relève bien le STOCK — surtout PAS une quantité de recette, PAS un coût unitaire, PAS un prix, PAS un poids en kg. Ne liste QUE ce qui est réellement visible — n'invente rien.",
    "Relève chaque ressource et son STOCK (pas les quantités de recette ni les prix), et renvoie le JSON.",
    1024,
  );
  if (!r.ok) return { ok: false, error: r.error };
  const m = (r.txt || "").match(/\{[\s\S]*\}/);
  if (!m) return { ok: false, error: "Capture illisible — réessaie avec une image plus nette." };
  try {
    const j = JSON.parse(m[0]) as { lignes?: unknown };
    const arr = Array.isArray(j.lignes) ? j.lignes : [];
    const lignes = arr
      .map((x) => { const o = (x || {}) as Record<string, unknown>; return { nom: s(o.nom, 80) || "", quantite: Math.max(0, Math.round(Number(o.quantite) || 0)) }; })
      .filter((l) => l.nom);
    return lignes.length ? { ok: true, lignes } : { ok: false, error: "Aucune ressource détectée sur la capture." };
  } catch { return { ok: false, error: "Capture illisible — réessaie avec une image plus nette." }; }
}
