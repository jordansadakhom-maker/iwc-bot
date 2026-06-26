// ───────────────────────────────────────────────────────────────────────────
//  chiffrement.js — Salon de chiffrement RP (coder / décoder un message)
//  ----------------------------------------------------------------------------
//  Dans le salon configuré, un panneau propose :
//    🔒 Coder   : tu colles un message clair → le bot rend la version CODÉE
//                 (à copier-coller en jeu).
//    🔓 Décoder : tu colles un message codé → le bot rend le message CLAIR.
//  Réponses ÉPHÉMÈRES (privées). Chiffre Vigenère sur un alphabet FR :
//  réversible, garde la longueur, gère lettres/chiffres/accents/ponctuation.
//  Identifiants ISOLÉS : « crypt_* ».
// ───────────────────────────────────────────────────────────────────────────
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags } = require('discord.js');

const SALON_CHIFFRE = '1519983119459942452';
const CLE = 'IRONWOLFCONFRERIE'; // clé du chiffre (partagée par le bot)
// Alphabet pris en charge (les caractères hors-alphabet passent inchangés : emojis, sauts de ligne…)
const ALPHA = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 .,!?'\"-:;()/àâäéèêëïîôöùûüÿçœÀÂÄÉÈÊËÏÎÔÖÙÛÜÇ";
const _N = [...ALPHA].length;
const _ALPHA_ARR = [...ALPHA];
const _IDX = new Map(_ALPHA_ARR.map((c, i) => [c, i]));

// sens = +1 (coder), -1 (décoder). La clé n'avance que sur les caractères de l'alphabet
// → encode et decode restent parfaitement symétriques.
function _vigenere(txt, sens) {
  const t = String(txt || '').normalize('NFC');
  let out = ''; let ki = 0;
  for (const ch of t) {
    const i = _IDX.get(ch);
    if (i === undefined) { out += ch; continue; } // hors alphabet → inchangé
    const k = _IDX.get(CLE[ki % CLE.length]) || 0; ki++;
    let j = (i + sens * k) % _N; if (j < 0) j += _N;
    out += _ALPHA_ARR[j];
  }
  return out;
}
const coder = (txt) => _vigenere(txt, 1);
const decoder = (txt) => _vigenere(txt, -1);

const _TITRE = '🔐 SALON DE CHIFFREMENT';
function _panneauEmbed() {
  return new EmbedBuilder()
    .setColor(0x2B2118)
    .setTitle(_TITRE)
    .setDescription([
      '*Pour transmettre un message secret en jeu, sans qu\'on le comprenne.*',
      '',
      '🔒 **Coder un message** — colle ton texte clair, je te rends la **version codée** à recopier en jeu.',
      '🔓 **Décoder un message** — colle un message codé reçu, je te rends le **message clair**.',
      '',
      '*Tout se fait en privé (réponse visible de toi seul).*',
    ].join('\n'))
    .setFooter({ text: 'La force est dans l\'ombre — La Compagnie' });
}
function _panneauRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('crypt_enc').setLabel('Coder un message').setEmoji('🔒').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('crypt_dec').setLabel('Décoder un message').setEmoji('🔓').setStyle(ButtonStyle.Secondary),
  );
}

async function installerPanneau(client) {
  try {
    const ch = await client.channels.fetch(SALON_CHIFFRE).catch(() => null);
    if (!ch || typeof ch.send !== 'function') return;
    const botId = client.user.id;
    let exists = null;
    try { const pins = await ch.messages.fetchPinned().catch(() => null); if (pins) exists = pins.find(m => m.author?.id === botId && (m.embeds?.[0]?.title || '').includes('CHIFFREMENT')); } catch {}
    if (!exists) { const recent = await ch.messages.fetch({ limit: 30 }).catch(() => null); if (recent) exists = recent.find(m => m.author?.id === botId && (m.embeds?.[0]?.title || '').includes('CHIFFREMENT')); }
    if (exists) return;
    const m = await ch.send({ embeds: [_panneauEmbed()], components: [_panneauRow()] }).catch(() => null);
    if (m) await m.pin().catch(() => {});
  } catch (e) { console.log('⚠️ chiffrement installerPanneau:', e.message); }
}

function _modal(sens) {
  const enc = sens === 'enc';
  const m = new ModalBuilder().setCustomId(enc ? 'crypt_enc_modal' : 'crypt_dec_modal').setTitle(enc ? '🔒 Coder un message' : '🔓 Décoder un message');
  m.addComponents(new ActionRowBuilder().addComponents(
    new TextInputBuilder().setCustomId('txt')
      .setLabel(enc ? 'Message clair à coder' : 'Message codé à décoder')
      .setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(3500)
      .setPlaceholder(enc ? 'Ex : Rendez-vous à Rhodes au plus vite…' : 'Colle ici le message codé reçu…'),
  ));
  return m;
}

async function routeInteraction(interaction) {
  try {
    const cid = interaction.customId || '';
    if (!cid.startsWith('crypt_')) return false;

    if (interaction.isButton?.() && cid === 'crypt_enc') { await interaction.showModal(_modal('enc')).catch(() => {}); return true; }
    if (interaction.isButton?.() && cid === 'crypt_dec') { await interaction.showModal(_modal('dec')).catch(() => {}); return true; }

    if (interaction.isModalSubmit?.() && cid === 'crypt_enc_modal') {
      const txt = interaction.fields.getTextInputValue('txt') || '';
      const out = coder(txt);
      await interaction.reply({ content: `🔒 **Message codé** — recopie-le en jeu :\n\`\`\`\n${out.slice(0, 1900)}\n\`\`\``, flags: MessageFlags.Ephemeral }).catch(() => {});
      return true;
    }
    if (interaction.isModalSubmit?.() && cid === 'crypt_dec_modal') {
      const txt = interaction.fields.getTextInputValue('txt') || '';
      const out = decoder(txt.trim());
      await interaction.reply({ content: `🔓 **Message décodé** :\n\`\`\`\n${out.slice(0, 1900)}\n\`\`\``, flags: MessageFlags.Ephemeral }).catch(() => {});
      return true;
    }
    return false;
  } catch (e) {
    if ([10062, 10008, 40060].includes(e?.code)) return true;
    console.log('❌ chiffrement routeInteraction:', e.message);
    try { if (interaction.isRepliable?.() && !interaction.replied && !interaction.deferred) await interaction.reply({ content: '❌ Erreur de chiffrement.', flags: MessageFlags.Ephemeral }); } catch {}
    return true;
  }
}

module.exports = { routeInteraction, installerPanneau, coder, decoder, SALON_CHIFFRE };
