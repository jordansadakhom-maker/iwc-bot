// ───────────────────────────────────────────────────────────────────────────
//  traduction-reunion.js — Traduction automatique d'une réunion audio (anglais → français)
//  ----------------------------------------------------------------------------
//  Tu enregistres une réunion (en anglais) et tu envoies le FICHIER AUDIO :
//    • soit en MESSAGE PRIVÉ au bot (le plus simple et le plus discret),
//    • soit dans le salon dédié (id via TRADUCTION_CHANNEL_ID, ou un salon dont
//      le nom contient « traduction » ou « reunion »).
//
//  Le bot écoute l'audio (Gemini gère l'audio nativement), puis répond avec :
//    • un RÉSUMÉ en français,
//    • les POINTS CLÉS et les DÉCISIONS / ACTIONS,
//    • la TRADUCTION COMPLÈTE en français (en fichier .txt si c'est long).
//
//  Silencieux s'il n'y a pas de clé GEMINI_API_KEY (ou GOOGLE_API_KEY) :
//  rien n'est touché, l'enregistrement reste en place.
//  Branché via index.js (messageCreate → onMessage).
// ───────────────────────────────────────────────────────────────────────────
const { EmbedBuilder, AttachmentBuilder } = require('discord.js');

// Salon dédié dans le serveur (optionnel). En message privé au bot, ça marche toujours.
const TRADUCTION_CHANNEL_ID = process.env.TRADUCTION_CHANNEL_ID || '';

// Modèles Gemini essayés dans l'ordre (repli automatique si l'un échoue).
const GEMINI_MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];

// Au-delà de cette taille, on passe par l'API Files de Gemini (upload) au lieu de l'inline base64.
const INLINE_MAX = 15 * 1024 * 1024; // ~15 Mo

const PROMPT = `Tu es un interprète et un secrétaire de séance professionnel.
On te donne l'enregistrement audio d'une réunion. La langue parlée est le plus souvent l'ANGLAIS (mais ce peut être une autre langue).
Ta mission : aider une personne qui ne comprend pas l'anglais à savoir précisément ce qui a été dit.

Réponds UNIQUEMENT en JSON valide (aucun markdown, aucune balise \`\`\`), avec EXACTEMENT ce format :
{"langue":"langue parlée détectée (ex: anglais)","resume":"résumé fidèle de la réunion en français, 4 à 8 phrases, va droit au contenu","points":["point clé important en français", "..."],"decisions":["décision prise ou action à faire en français (qui fait quoi, échéance si dite)", "..."],"traduction":"TRADUCTION FRANÇAISE complète et fidèle de toute la réunion, du début à la fin. Traduis tout ce qui est dit. Si plusieurs personnes parlent et qu'on les distingue, indique-les (ex: « Personne 1 : … »). N'invente rien."}

Règles :
- Traduis en FRANÇAIS, pas en anglais.
- Reste fidèle : ne résume pas la clé « traduction », traduis réellement l'intégralité.
- Si un passage est inaudible, écris « [inaudible] » plutôt que d'inventer.
- Si l'audio est vide ou ne contient pas de parole, réponds {"langue":"?","resume":"RIEN","points":[],"decisions":[],"traduction":""}.`;

// ── Détection / normalisation du type audio ──
const _AUDIO_EXT = /\.(mp3|m4a|mp4|wav|ogg|oga|opus|aac|flac|aiff?|webm|amr|3gp|wma)(\?|$)/i;
function _estAudio(a) {
  if (!a) return false;
  const ct = (a.contentType || '').toLowerCase();
  if (ct.startsWith('audio')) return true;
  // Les messages vocaux Discord arrivent en audio/ogg ; certains clients envoient video/webm pour de l'audio.
  if (_AUDIO_EXT.test(a.name || a.url || '')) return true;
  if (a.waveform || a.durationSecs != null) return true; // message vocal Discord
  return false;
}
function _mimeAudio(a, buf) {
  let ct = (a.contentType || '').split(';')[0].trim().toLowerCase();
  const nom = (a.name || a.url || '').toLowerCase();
  const parExt = {
    '.mp3': 'audio/mp3', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.oga': 'audio/ogg',
    '.opus': 'audio/ogg', '.aac': 'audio/aac', '.flac': 'audio/flac', '.aiff': 'audio/aiff',
    '.aif': 'audio/aiff', '.m4a': 'audio/aac', '.mp4': 'audio/aac', '.webm': 'audio/ogg',
  };
  for (const [ext, mt] of Object.entries(parExt)) { if (nom.endsWith(ext)) return mt; }
  if (ct === 'audio/mpeg') return 'audio/mp3';
  if (ct === 'audio/x-m4a' || ct === 'audio/mp4' || ct === 'video/mp4') return 'audio/aac';
  if (ct === 'audio/webm' || ct === 'video/webm') return 'audio/ogg';
  if (ct.startsWith('audio/')) return ct;
  return 'audio/mp3'; // repli raisonnable
}

async function _bytes(url) {
  try { const r = await fetch(url); if (!r.ok) return null; return Buffer.from(await r.arrayBuffer()); }
  catch { return null; }
}

// ── Upload par l'API Files de Gemini (pour les gros fichiers), avec attente du traitement ──
async function _uploadFichier(apiKey, buf, mimeType, displayName) {
  const base = 'https://generativelanguage.googleapis.com';
  // 1) Démarrer un upload résumable
  const start = await fetch(`${base}/upload/v1beta/files?key=${apiKey}`, {
    method: 'POST',
    headers: {
      'X-Goog-Upload-Protocol': 'resumable',
      'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Header-Content-Length': String(buf.length),
      'X-Goog-Upload-Header-Content-Type': mimeType,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ file: { display_name: displayName || 'reunion' } }),
  });
  if (!start.ok) { console.log(`❌ traduction upload start HTTP ${start.status}`); return null; }
  const uploadUrl = start.headers.get('x-goog-upload-url');
  if (!uploadUrl) { console.log('❌ traduction upload: pas d\'URL d\'upload'); return null; }
  // 2) Envoyer les octets et finaliser
  const up = await fetch(uploadUrl, {
    method: 'POST',
    headers: { 'Content-Length': String(buf.length), 'X-Goog-Upload-Offset': '0', 'X-Goog-Upload-Command': 'upload, finalize' },
    body: buf,
  });
  if (!up.ok) { console.log(`❌ traduction upload finalize HTTP ${up.status}`); return null; }
  let info = await up.json().catch(() => null);
  let file = info?.file;
  if (!file?.name) { console.log('❌ traduction upload: réponse sans fichier'); return null; }
  // 3) Attendre que le fichier soit ACTIF (l'audio est traité côté Google)
  let state = file.state;
  for (let i = 0; i < 30 && state === 'PROCESSING'; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const chk = await fetch(`${base}/v1beta/${file.name}?key=${apiKey}`).catch(() => null);
    if (!chk || !chk.ok) break;
    const cur = await chk.json().catch(() => null);
    if (cur) { file = cur; state = cur.state; }
  }
  if (state && state !== 'ACTIVE') { console.log(`⚠️ traduction fichier état=${state}`); if (state === 'FAILED') return null; }
  return file; // { uri, mimeType, name, ... }
}

// ── Un appel Gemini (transcription + traduction) ──
async function _appelGemini(model, apiKey, audioPart) {
  try {
    const body = {
      contents: [{ role: 'user', parts: [{ text: PROMPT }, audioPart] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 16384 },
    };
    const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify(body),
    });
    if (!resp.ok) { const t = await resp.text().catch(() => ''); console.log(`❌ traduction Gemini ${model} HTTP ${resp.status}: ${t.slice(0, 200)}`); return null; }
    const data = await resp.json();
    const txt = (data?.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('').trim();
    return txt || null;
  } catch (e) { console.log(`❌ traduction Gemini ${model} exception:`, e.message); return null; }
}

function _parseJson(txt) {
  if (!txt) return null;
  let s = txt.replace(/```json|```/g, '').trim();
  // Isole le premier objet JSON s'il y a du texte autour.
  const i = s.indexOf('{'), j = s.lastIndexOf('}');
  if (i >= 0 && j > i) s = s.slice(i, j + 1);
  try { return JSON.parse(s); } catch {}
  return null;
}

// ── Traite un fichier audio → objet résultat ──
async function _traduire(a) {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) return null;
  const buf = await _bytes(a.url);
  if (!buf || buf.length < 1000) return null;
  const mimeType = _mimeAudio(a, buf);

  // Choix inline vs upload selon la taille (le base64 gonfle ~33 %, on garde de la marge).
  let audioPart = null;
  if (buf.length <= INLINE_MAX) {
    audioPart = { inlineData: { mimeType, data: buf.toString('base64') } };
  } else {
    const file = await _uploadFichier(apiKey, buf, mimeType, a.name || 'reunion');
    if (!file?.uri) return null;
    audioPart = { fileData: { mimeType: file.mimeType || mimeType, fileUri: file.uri } };
  }

  for (const model of GEMINI_MODELS) {
    const txt = await _appelGemini(model, apiKey, audioPart);
    if (!txt) continue;
    const obj = _parseJson(txt);
    if (obj) return obj;
    // Repli : pas de JSON exploitable → on renvoie le texte brut comme traduction.
    return { langue: '?', resume: '', points: [], decisions: [], traduction: txt };
  }
  return null;
}

// ── Le salon est-il éligible ? (DM au bot, ou salon dédié) ──
function _salonOk(message) {
  if (!message.guild) return true; // message privé au bot
  if (TRADUCTION_CHANNEL_ID && (message.channelId === TRADUCTION_CHANNEL_ID || message.channel?.parentId === TRADUCTION_CHANNEL_ID)) return true;
  const nom = (message.channel?.name || '').toLowerCase();
  return /traduc|réunion|reunion|meeting/.test(nom);
}

async function onMessage(message) {
  try {
    if (!message || message.author?.bot || message.webhookId) return false;
    if (!_salonOk(message)) return false;
    const audios = message.attachments ? [...message.attachments.values()].filter(_estAudio) : [];
    if (!audios.length) return false;
    if (!(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY)) { await message.react('⚠️').catch(() => {}); return false; }

    const a = audios[0]; // on traite le premier fichier audio du message
    await message.react('🎧').catch(() => {});
    const wait = await message.reply({ content: '🎧 J\'écoute et je traduis la réunion en français… (ça peut prendre un moment)', allowedMentions: { parse: [] } }).catch(() => null);

    const res = await _traduire(a);
    if (!res || /^RIEN\.?$/i.test(String(res.resume || '').trim()) && !(res.traduction || '').trim()) {
      await message.react('⚠️').catch(() => {});
      if (wait) await wait.edit('⚠️ Je n\'ai pas réussi à traiter cet audio (fichier vide, illisible, ou format non reconnu). Essaie un .mp3, .m4a, .wav ou .ogg.').catch(() => {});
      return true;
    }

    const traduction = String(res.traduction || '').trim();
    const resume = String(res.resume || '').trim();
    const points = Array.isArray(res.points) ? res.points.filter(Boolean).map(String) : [];
    const decisions = Array.isArray(res.decisions) ? res.decisions.filter(Boolean).map(String) : [];

    const embed = new EmbedBuilder()
      .setColor(0x3B82F6)
      .setTitle('🌐 Traduction de la réunion')
      .setFooter({ text: `Traduit automatiquement par l'IA depuis ${res.langue || 'la langue parlée'} · fichier : ${(a.name || 'audio').slice(0, 60)}` });
    if (resume) embed.setDescription(`**📝 Résumé**\n${resume.slice(0, 3800)}`);
    if (points.length) embed.addFields({ name: '📌 Points clés', value: points.slice(0, 10).map(p => `• ${p}`).join('\n').slice(0, 1024) });
    if (decisions.length) embed.addFields({ name: '✅ Décisions / actions', value: decisions.slice(0, 10).map(d => `• ${d}`).join('\n').slice(0, 1024) });

    // La traduction complète : en fichier .txt si c'est long, sinon dans un 2ᵉ embed.
    const files = [];
    const embeds = [embed];
    if (traduction) {
      if (traduction.length > 1500) {
        const entete = `Traduction française de la réunion\nFichier : ${a.name || 'audio'}\nLangue parlée : ${res.langue || '?'}\n${'='.repeat(50)}\n\n`;
        files.push(new AttachmentBuilder(Buffer.from(entete + traduction, 'utf8'), { name: 'traduction-reunion.txt' }));
        embed.addFields({ name: '📄 Traduction complète', value: '➡️ Voir le fichier **traduction-reunion.txt** joint ci-dessous.' });
      } else {
        embeds.push(new EmbedBuilder().setColor(0x2563EB).setTitle('🗣️ Traduction complète').setDescription(traduction.slice(0, 4000)));
      }
    }

    await message.react('✅').catch(() => {});
    const payload = { embeds, allowedMentions: { parse: [] } };
    if (files.length) payload.files = files;
    if (wait) { await wait.edit({ content: '', ...payload }).catch(async () => { await message.reply(payload).catch(() => {}); }); }
    else await message.reply(payload).catch(() => {});
    return true;
  } catch (e) { console.log('⚠️ traduction-reunion onMessage:', e.message); return false; }
}

// ── Panneau permanent (posté + épinglé une seule fois) dans le salon dédié, si configuré ──
const _TITRE_PANNEAU = '🌐 TRADUCTION DES RÉUNIONS';
function _panneauEmbed() {
  return new EmbedBuilder()
    .setColor(0x3B82F6)
    .setTitle(_TITRE_PANNEAU)
    .setDescription([
      '*Tu enregistres une réunion en **anglais** et tu ne comprends pas tout ? Envoie-moi le **fichier audio** — je te le **traduis en français**.*',
      '',
      '**Comment faire :**',
      '1️⃣ Envoie ton **enregistrement** (.mp3, .m4a, .wav ou .ogg) ici — ou en **message privé** au bot.',
      '2️⃣ Je l\'écoute (🎧) puis je réponds avec un **📝 résumé**, les **📌 points clés**, les **✅ décisions**, et la **traduction complète**.',
      '',
      '💡 Astuce : pour une réunion privée, envoie-moi le fichier en **message privé** — personne d\'autre ne le verra.',
      '✅ Aucune commande à taper.',
    ].join('\n'))
    .setFooter({ text: 'Traduction rédigée par l\'IA d\'après l\'audio' });
}
function _estPanneau(m, botId) {
  return m.author?.id === botId && (m.embeds?.[0]?.title || '').includes('TRADUCTION DES RÉUNIONS');
}
async function installerPanneau(client) {
  try {
    if (!TRADUCTION_CHANNEL_ID) return; // pas de salon dédié configuré → rien à installer (le MP marche quand même)
    const ch = await client.channels.fetch(TRADUCTION_CHANNEL_ID).catch(() => null);
    if (!ch || typeof ch.send !== 'function') return;
    const botId = client.user.id;
    let exists = null;
    try { const pins = await ch.messages.fetchPinned().catch(() => null); if (pins) exists = pins.find(m => _estPanneau(m, botId)); } catch {}
    if (!exists) { const recent = await ch.messages.fetch({ limit: 30 }).catch(() => null); if (recent) exists = recent.find(m => _estPanneau(m, botId)); }
    if (exists) return;
    const m = await ch.send({ embeds: [_panneauEmbed()] }).catch(() => null);
    if (m) await m.pin().catch(() => {});
  } catch (e) { console.log('⚠️ traduction-reunion installerPanneau:', e.message); }
}

module.exports = { onMessage, installerPanneau, TRADUCTION_CHANNEL_ID };
