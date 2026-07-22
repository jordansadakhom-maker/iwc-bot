// Envoi d'e-mail via Resend (API HTTP simple — pas de SMTP à configurer).
// 100 % optionnel : tant que RESEND_API_KEY / EMAIL_FROM ne sont pas définis sur
// Vercel, la fonction ne casse RIEN — elle renvoie { ok:false, reason:"non configuré" }
// et l'appelant garde la réponse en trace (le client peut la lire sur /suivi).
//
// Mise en place (une fois) :
//   1. Créer un compte gratuit sur resend.com et vérifier un domaine (ou utiliser
//      onboarding@resend.dev pour tester).
//   2. Ajouter sur Vercel : RESEND_API_KEY = re_…  et  EMAIL_FROM = "Iron Wolf Company <no-reply@ton-domaine>".

export type EnvoiEmailResult = { ok: boolean; reason?: string };

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export async function envoyerEmail(to: string, sujet: string, texte: string): Promise<EnvoiEmailResult> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!key || !from) return { ok: false, reason: "non configuré" };
  if (!EMAIL_RE.test(to)) return { ok: false, reason: "adresse invalide" };
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, subject: sujet.slice(0, 200), text: texte.slice(0, 8000) }),
    });
    if (!r.ok) return { ok: false, reason: `HTTP ${r.status}` };
    return { ok: true };
  } catch {
    return { ok: false, reason: "réseau" };
  }
}
