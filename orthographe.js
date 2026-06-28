// ═══════════════════════════════════════════════════════════════
//  orthographe.js — Correcteur automatique d'un salon
//  Chaque message écrit dans le salon est corrigé (orthographe, grammaire,
//  accents, ponctuation) PUIS reposté à l'identique sous le nom + l'avatar
//  de l'auteur (via webhook), l'original retiré. Le sens, le ton, le style
//  et les noms propres (RP) sont préservés. Aucune correction = on ne touche
//  à rien.
// ═══════════════════════════════════════════════════════════════
const { WebhookClient } = require('discord.js');

const SALON_ORTHO = '1508756470672523405';
const _webhookCache = new Map(); // channelId -> { id, token }

async function _corriger(texte) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  try {
    const prompt = `Corrige UNIQUEMENT l'orthographe, la grammaire, les accents et la ponctuation du texte français ci-dessous.
Ne change RIEN d'autre : ni le sens, ni le ton, ni le style, ni les noms propres, ni les emojis, ni la mise en forme (retours à la ligne, gras, etc.).
Ne traduis pas. N'ajoute aucun commentaire, aucune explication, aucun guillemet autour.
Renvoie SEULEMENT le texte corrigé.

Texte :
${texte}`;
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 1500, messages: [{ role: 'user', content: prompt }] }),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    let t = (data?.content?.[0]?.text || '').trim();
    t = t.replace(/^["«»']+|["«»']+$/g, '').trim(); // retire d'éventuels guillemets ajoutés
    return t || null;
  } catch { return null; }
}

async function _getWebhook(channel) {
  const cached = _webhookCache.get(channel.id);
  if (cached) return new WebhookClient({ id: cached.id, token: cached.token });
  try {
    const hooks = await channel.fetchWebhooks().catch(() => null);
    let hook = hooks?.find(h => h.owner?.id === channel.client.user.id && h.token);
    if (!hook) hook = await channel.createWebhook({ name: 'IWC • Plume' }).catch(() => null);
    if (hook?.token) { _webhookCache.set(channel.id, { id: hook.id, token: hook.token }); return new WebhookClient({ id: hook.id, token: hook.token }); }
  } catch {}
  return null;
}

// Vrai seulement si le message contient du texte réellement corrigible.
function _corrigible(message) {
  const c = (message.content || '').trim();
  if (!c) return false;
  if (/^[!\/.>]/.test(c)) return false;              // commande / citation
  if (!/[a-zA-Zà-ÿÀ-Ÿ]{2,}/.test(c)) return false;   // pas de vrais mots (emoji/lien seul)
  if (/^https?:\/\/\S+$/.test(c)) return false;       // lien seul
  if (c.length > 1500) return false;                  // trop long (sécurité)
  return true;
}

async function onMessage(message) {
  try {
    if (!message.guild || message.channel?.id !== SALON_ORTHO) return false;
    if (message.author?.bot || message.webhookId) return false; // évite toute boucle
    if (!_corrigible(message)) return false;

    const original = message.content.trim();
    const corrige = await _corriger(original);
    if (!corrige) return false;
    const norm = s => s.replace(/\s+/g, ' ').trim();
    if (norm(corrige) === norm(original)) return false; // déjà correct → on ne touche à rien

    const member = message.member;
    const pseudo = (member?.displayName || message.author.username).slice(0, 80);
    const avatar = (member || message.author).displayAvatarURL?.({ extension: 'png' }) || undefined;
    const files = message.attachments?.size ? [...message.attachments.values()].map(a => a.url) : [];

    let ok = false;
    const hook = await _getWebhook(message.channel);
    if (hook) {
      const sent = await hook.send({ content: corrige.slice(0, 2000), username: pseudo, avatarURL: avatar, files, allowedMentions: { parse: [] } }).catch(() => null);
      ok = !!sent;
    }
    if (!ok) { // repli si pas de webhook possible
      const sent = await message.channel.send({ content: `**${pseudo} :** ${corrige.slice(0, 1900)}`, files, allowedMentions: { parse: [] } }).catch(() => null);
      ok = !!sent;
    }
    if (ok) await message.delete().catch(() => {});
    return ok;
  } catch (e) { console.log('❌ orthographe onMessage:', e.message); return false; }
}

module.exports = { onMessage, SALON_ORTHO };
