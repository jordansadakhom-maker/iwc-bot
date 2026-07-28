// ═══════════════════════════════════════════════════════════════
// demandes-web.js — Notifie sur Discord les nouvelles DEMANDES du site
//
// La gestion se fait 100 % sur le SITE (conversation, statut, attribution).
// Discord ne sert qu'à PRÉVENIR : ce module relève les demandes non encore
// annoncées (Demande.annonceAt IS NULL), poste un résumé + un bouton « Ouvrir
// sur le site » (lien profond /demandes/<id>) en mentionnant le rôle concerné,
// puis marque la demande annoncée — UNIQUEMENT après un envoi réussi.
//
// « Ne rien dérégler » : best-effort, no-op sans Supabase. Salon configurable
// via SALON_DEMANDES (sinon repli : salon nommé, systemChannel, 1er salon).
// ═══════════════════════════════════════════════════════════════

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const supa = require('./supabase-sync');

const SALON_DEMANDES = process.env.SALON_DEMANDES || '';
const SITE = (process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || process.env.SITE_URL || 'https://iwc-bot-psi.vercel.app').replace(/\/+$/, '');

const PRIO = {
  critique: { color: 0xb0413a, emoji: '🔴', label: 'Critique' },
  elevee:   { color: 0xd8a53f, emoji: '🟠', label: 'Élevée' },
  normale:  { color: 0x4d7ea8, emoji: '🔵', label: 'Normale' },
  faible:   { color: 0x8a8f98, emoji: '⚪', label: 'Faible' },
};
const TYPE_LABEL = {
  prestation: 'Demande de prestation', rh: 'Demande RH', signalement: 'Signalement',
  operation: 'Opération', facture: 'Facturation', commande: 'Commande', rdv: 'Rendez-vous', autre: 'Demande',
};
const ROLE_PATTERNS = {
  direction: /fondateur|conseil|directeur|fl[eé]au|concepteur/i,
  officier: /officier|instructeur/i,
  armurier: /armur/i,
  medecin: /panseur|m[eé]decin/i,
};

function _mentionRole(guild, roleCible) {
  const pat = ROLE_PATTERNS[String(roleCible || '').toLowerCase()];
  if (!pat) return '';
  const role = guild.roles.cache.find((r) => pat.test(r.name));
  return role ? `<@&${role.id}>` : '';
}
async function _salon(guild) {
  if (SALON_DEMANDES) return guild.channels.cache.get(SALON_DEMANDES) || (await guild.channels.fetch(SALON_DEMANDES).catch(() => null));
  const parNom = guild.channels.cache.find((c) => c.isTextBased?.() && /demande|guichet|ticket|support/i.test(c.name));
  return parNom || guild.systemChannel || guild.channels.cache.find((c) => c.isTextBased?.() && c.viewable) || null;
}
function _lien(id) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Ouvrir sur le site').setEmoji('➡️').setURL(`${SITE}/demandes/${id}`),
  );
}

// Relève les nouvelles demandes et les annonce sur Discord.
async function verifierDemandesWeb(guild) {
  if (!guild || !supa.lireDemandesANotifier) return;
  let rows;
  try { rows = await supa.lireDemandesANotifier(); } catch { return; }
  if (!Array.isArray(rows) || !rows.length) return;
  const ch = await _salon(guild);
  if (!ch?.send) return;

  for (const d of rows) {
    let envoye = false;
    try {
      const prio = PRIO[String(d.priorite || 'normale')] || PRIO.normale;
      const lignes = [];
      if (d.ref) lignes.push(`**N° :** \`${d.ref}\``);
      lignes.push(`**Type :** ${TYPE_LABEL[String(d.type)] || 'Demande'}`);
      lignes.push(`**Priorité :** ${prio.emoji} ${prio.label}`);
      if (d.auteurNom) lignes.push(`**Auteur :** ${d.auteurNom}`);
      if (d.resume) lignes.push(`\n${String(d.resume).slice(0, 400)}`);
      lignes.push('\n*Réponds directement sur le site — Discord ne sert qu\'à prévenir.*');
      const e = new EmbedBuilder()
        .setColor(prio.color)
        .setTitle(`📨 ${String(d.titre || 'Nouvelle demande').slice(0, 240)}`)
        .setDescription(lignes.join('\n'))
        .setFooter({ text: 'Iron Wolf Company · Guichet des demandes' })
        .setTimestamp(new Date(d.createdAt || Date.now()));
      const mention = _mentionRole(guild, d.roleCible);
      await ch.send({ content: mention || undefined, embeds: [e], components: [_lien(d.id)], allowedMentions: { parse: ['roles'] } });
      envoye = true;
    } catch (err) {
      console.log('⚠️ demandes-web (envoi):', err.message);
    }
    // Marque annoncée UNIQUEMENT après un envoi réussi → réessai au lieu de perte.
    if (envoye) { try { await supa.marquerDemandeAnnoncee(d.id); } catch {} }
  }
}

// Relance automatique : digest des demandes non assignées / sans activité depuis
// 24 h. Rappelle à l'équipe ce qui attend — le traitement se fait sur le site.
async function verifierRelancesDemandes(guild) {
  if (!guild || !supa.lireDemandesEnAttente) return;
  let rows;
  try { rows = await supa.lireDemandesEnAttente(); } catch { return; }
  if (!Array.isArray(rows) || !rows.length) return;
  const now = Date.now();
  const nonAssignees = rows.filter((d) => !d.assigneId);
  const enSouffrance = rows.filter((d) => d.assigneId && d.updatedAt && (now - Date.parse(d.updatedAt)) > 86400000);
  if (!nonAssignees.length && !enSouffrance.length) return;
  const ch = await _salon(guild);
  if (!ch?.send) return;

  const ligne = (d) => `• \`${d.ref || String(d.id).slice(0, 6)}\` ${String(d.titre || '').slice(0, 60)} — ${SITE}/demandes/${d.id}`;
  const parts = [];
  if (nonAssignees.length) parts.push(`**🕓 Non assignées (${nonAssignees.length})**\n${nonAssignees.slice(0, 12).map(ligne).join('\n')}`);
  if (enSouffrance.length) parts.push(`**⏳ Sans activité depuis 24 h (${enSouffrance.length})**\n${enSouffrance.slice(0, 12).map(ligne).join('\n')}`);
  const e = new EmbedBuilder()
    .setColor(0xd8a53f)
    .setTitle('📋 Demandes à traiter')
    .setDescription(parts.join('\n\n').slice(0, 3900))
    .setFooter({ text: 'Iron Wolf Company · Guichet des demandes' })
    .setTimestamp();
  await ch.send({ embeds: [e] }).catch(() => {});
}

module.exports = { verifierDemandesWeb, verifierRelancesDemandes };
