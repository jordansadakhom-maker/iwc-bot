import { createHmac, timingSafeEqual } from "node:crypto";

// Jeton de SIGNATURE de contrat — lien profond non devinable envoyé au client.
// HMAC-SHA256 sur « <opId>.<expiration> » + secret partagé (SIGN_TOKEN_SECRET,
// identique côté bot). Sans secret → null (fonctionnalité désactivée proprement).
// Le secret est lu à l'exécution (pas au chargement) pour rester testable.

const secret = () => process.env.SIGN_TOKEN_SECRET || "";
const b64url = (b: Buffer) => b.toString("base64url");
const sig = (data: string) => b64url(createHmac("sha256", secret()).update(data).digest());

const DUREE_DEFAUT = 30 * 86400000; // 30 jours

// Crée un jeton pour une opération. null si secret absent ou opId vide.
export function creerTokenSignature(opId: string, dureeMs = DUREE_DEFAUT): string | null {
  if (!secret() || !opId) return null;
  const exp = Date.now() + dureeMs;
  const data = `${b64url(Buffer.from(String(opId)))}.${exp}`;
  return `${data}.${sig(data)}`;
}

// Vérifie un jeton : renvoie { opId } si valide & non expiré, sinon null.
export function verifierTokenSignature(token: string): { opId: string } | null {
  if (!secret() || !token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [encId, expStr, s] = parts;
  const attendu = sig(`${encId}.${expStr}`);
  try {
    const a = Buffer.from(s), b = Buffer.from(attendu);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch { return null; }
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || Date.now() > exp) return null;
  let opId = "";
  try { opId = Buffer.from(encId, "base64url").toString("utf8"); } catch { return null; }
  return opId ? { opId } : null;
}
