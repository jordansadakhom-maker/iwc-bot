import "server-only";

// Appel IA texte générique (côté serveur, jamais exposé au client). Réutilisé par
// le débriefing d'opération, la fiche cible, le briefing du jour et la recherche
// en langage naturel. Renvoie le texte produit, ou une erreur lisible.
export type IaResult = { ok: true; texte: string } | { ok: false; error: string };

export async function iaTexte(system: string, user: string, maxTokens = 1200): Promise<IaResult> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { ok: false, error: "L'IA n'est pas encore activée (ajoute la variable ANTHROPIC_API_KEY sur Vercel)." };
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: "claude-sonnet-5", max_tokens: maxTokens, system, messages: [{ role: "user", content: user }] }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      console.error("iaTexte:", res.status, t.slice(0, 200));
      return { ok: false, error: "L'IA est momentanément indisponible. Réessaie dans un instant." };
    }
    const data = await res.json();
    const txt = ((data?.content || []) as { type: string; text?: string }[])
      .filter((b) => b.type === "text").map((b) => b.text || "").join("").trim();
    if (!txt) return { ok: false, error: "Réponse vide de l'IA." };
    return { ok: true, texte: txt };
  } catch (e) {
    console.error("iaTexte:", (e as Error).message);
    return { ok: false, error: "L'IA est injoignable pour le moment." };
  }
}
