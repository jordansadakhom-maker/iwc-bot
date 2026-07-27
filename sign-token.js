// Jeton de SIGNATURE de contrat — MÊME algorithme que web/lib/sign-token.ts
// (HMAC-SHA256 sur « <opId>.<expiration> » + SIGN_TOKEN_SECRET partagé). Le bot
// génère le lien, le site le vérifie. Sans secret → null (désactivé proprement).
const { createHmac } = require('crypto');

const secret = () => process.env.SIGN_TOKEN_SECRET || '';
const b64url = (b) => b.toString('base64url');
const sig = (data) => b64url(createHmac('sha256', secret()).update(data).digest());

const DUREE_DEFAUT = 30 * 86400000; // 30 jours

function creerTokenSignature(opId, dureeMs = DUREE_DEFAUT) {
  if (!secret() || !opId) return null;
  const exp = Date.now() + dureeMs;
  const data = `${b64url(Buffer.from(String(opId)))}.${exp}`;
  return `${data}.${sig(data)}`;
}

// Lien complet de signature (ou null si non configuré).
function lienSignature(opId) {
  const tok = creerTokenSignature(opId);
  if (!tok) return null;
  const base = (process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || process.env.SITE_URL || 'https://iwc-bot-psi.vercel.app').replace(/\/+$/, '');
  return `${base}/suivi/contrat/${tok}`;
}

module.exports = { creerTokenSignature, lienSignature };
