// ─────────────────────────────────────────────────────────────────────────────
//  modetest.js — Mode Test : marquer 🧪 les créations + purge en 1 clic
//  Quand le Mode Test est ACTIF, tout ce qui est créé (contrats, opérations,
//  traques…) est marqué `test:true`. Le flux complet tourne (forum inclus, pour
//  vérifier que ça marche), puis « 🧹 Purger les tests » efface d'un coup toutes
//  les données de test ET leurs artefacts Discord (fils de forum, messages).
// ─────────────────────────────────────────────────────────────────────────────
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const { loadDB, saveDB, sauvegarderSurGitHub } = require('./db');

const ROLES_DIRECTION = ['Concepteur', 'Fléau', 'Fondateur', 'Directeur', 'Officier', 'Instructeur', 'Secrétaire'];
const estDirection = (member) => global.aAccesTotal?.(member) || !!member?.roles?.cache?.some(r => ROLES_DIRECTION.some(n => r.name.includes(n)));

function _state() { const db = loadDB(); db.modeTest = db.modeTest || { actif: false }; return db.modeTest; }
function estActif() { try { return !!_state().actif; } catch { return false; } }
function setActif(val, userId) {
  const db = loadDB(); db.modeTest = db.modeTest || {};
  db.modeTest.actif = !!val; db.modeTest.depuis = new Date().toISOString(); db.modeTest.parId = userId || null;
  saveDB(db); sauvegarderSurGitHub?.().catch(() => {});
}

// Préfixe un titre de forum/fil si l'objet est un test (identification visuelle).
function prefixe(titre, obj) { return (obj && obj.test) ? `🧪 TEST — ${titre}`.slice(0, 100) : titre; }

// Compte les données de test en attente de purge.
function compter() {
  const db = loadDB();
  const c = (db.contrats || []).filter(x => x && x.test).length;
  const o = (db.preparations || []).filter(x => x && x.test).length + (db.operations || []).filter(x => x && x.test).length;
  const t = (db.traques || []).filter(x => x && x.test).length;
  return { contrats: c, operations: o, traques: t, total: c + o + t };
}

// Supprime au mieux les artefacts Discord d'un objet de test (fil de forum + messages).
async function _supprArtefacts(guild, obj) {
  if (!guild || !obj) return;
  const delThread = async (id) => {
    if (!id) return;
    const c = await guild.channels.fetch(id).catch(() => null);
    if (c && (c.isThread?.() || [10, 11, 12].includes(c.type))) await c.delete('Purge des tests').catch(() => {});
  };
  const delMsg = async (chId, msgId) => {
    if (!chId || !msgId) return;
    const ch = await guild.channels.fetch(chId).catch(() => null);
    if (ch?.messages) { const m = await ch.messages.fetch(msgId).catch(() => null); if (m) await m.delete().catch(() => {}); }
  };
  await delThread(obj.forumThreadId);
  await delThread(obj.threadId);
  await delMsg(obj.channelId, obj.msgId);
  await delMsg(obj.channelId, obj.messageId);
  await delMsg(obj.channelId, obj.forumMsgId);
}

// Purge : supprime toutes les données de test + leurs artefacts. Renvoie un rapport.
async function purger(guild) {
  const db = loadDB();
  const rapport = { contrats: 0, operations: 0, traques: 0 };
  const passe = async (cle, champRapport) => {
    const arr = db[cle]; if (!Array.isArray(arr)) return;
    const tests = arr.filter(x => x && x.test);
    for (const x of tests) { await _supprArtefacts(guild, x); rapport[champRapport]++; }
    db[cle] = arr.filter(x => !(x && x.test));
  };
  await passe('contrats', 'contrats');
  await passe('preparations', 'operations');
  await passe('operations', 'operations');
  await passe('traques', 'traques');
  saveDB(db); sauvegarderSurGitHub?.().catch(() => {});
  return rapport;
}

// ── UI ──
function lignesEtat() {
  const actif = estActif(); const n = compter();
  return `${actif ? '🧪 **Mode Test : ACTIVÉ**' : '⚪ Mode Test : désactivé'}\n📦 Données de test en attente : **${n.total}** (contrats ${n.contrats} · opérations ${n.operations} · traques ${n.traques})`;
}

async function routeInteraction(interaction) {
  try {
    const cid = interaction.customId || '';
    if (!cid.startsWith('mt_')) return false;
    if (!estDirection(interaction.member)) { await interaction.reply({ content: '🔒 Réservé à la Direction.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }

    if (cid === 'mt_toggle') {
      setActif(!estActif(), interaction.user.id);
      const actif = estActif();
      await interaction.reply({
        content: actif
          ? '🧪 **Mode Test ACTIVÉ.** Tout ce qui sera créé (contrats, opérations, traques) est marqué TEST et apparaîtra avec 🧪 dans les forums. Pense à **🧹 Purger les tests** ensuite.'
          : '⚪ **Mode Test désactivé.** Les nouvelles créations sont de nouveau réelles.',
        flags: MessageFlags.Ephemeral,
      }).catch(() => {});
      return true;
    }

    if (cid === 'mt_purge') {
      const n = compter();
      if (!n.total) { await interaction.reply({ content: '✅ Aucune donnée de test à purger.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      const embed = new EmbedBuilder().setColor(0xC0392B).setTitle('🧹 Purger les données de test ?')
        .setDescription(`Cela va **supprimer définitivement** :\n• ${n.contrats} contrat(s) de test\n• ${n.operations} opération(s) de test\n• ${n.traques} traque(s) de test\n\nAinsi que leurs **fils de forum et messages**. Action irréversible.`);
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('mt_purge_ok').setLabel('Oui, tout purger').setEmoji('🧹').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('mt_purge_no').setLabel('Annuler').setStyle(ButtonStyle.Secondary),
      );
      await interaction.reply({ embeds: [embed], components: [row], flags: MessageFlags.Ephemeral }).catch(() => {});
      return true;
    }
    if (cid === 'mt_purge_no') { await interaction.update({ content: '❌ Purge annulée.', embeds: [], components: [] }).catch(() => {}); return true; }
    if (cid === 'mt_purge_ok') {
      await interaction.update({ content: '🧹 Purge en cours…', embeds: [], components: [] }).catch(() => {});
      const r = await purger(interaction.guild);
      await interaction.editReply({ content: `✅ Purge terminée : **${r.contrats}** contrat(s), **${r.operations}** opération(s), **${r.traques}** traque(s) de test supprimés (données + forums).` }).catch(() => {});
      return true;
    }
    return false;
  } catch (e) {
    if ([10062, 10008, 40060].includes(e?.code)) return true;
    console.log('❌ modetest routeInteraction:', e.message);
    try { if (interaction.isRepliable?.() && !interaction.replied && !interaction.deferred) await interaction.reply({ content: '❌ Erreur.', flags: MessageFlags.Ephemeral }); } catch {}
    return true;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Garde « alertes » du Mode Test — installée une seule fois au démarrage.
//  Quand le Mode Test est ACTIF, on veut que les tests ne dérangent PERSONNE :
//    1) aucun ping (rôle / membre / @everyone) n'est réellement notifié ;
//    2) aucun message privé n'arrive aux membres réels — seuls les comptes à
//       « accès total » (les testeurs) reçoivent encore leurs MP, pour vérifier
//       les flux.
//  On intercepte au niveau de discord.js, à 2 points centraux, donc AUCUN besoin
//  de toucher aux centaines d'envois du bot. Quand le Mode Test est OFF, le
//  comportement est strictement inchangé.
// ─────────────────────────────────────────────────────────────────────────────
let _gardeInstallee = false;
function installerGardeAlertes() {
  if (_gardeInstallee) return;
  try {
    const { MessagePayload, DMChannel } = require('discord.js');

    // (1) Couper TOUS les pings tant que le Mode Test tourne. resolveBody()
    //     construit le corps REST de tout message (salons, threads, réponses,
    //     interactions, webhooks) → on y force « aucune mention ».
    const origResolveBody = MessagePayload.prototype.resolveBody;
    MessagePayload.prototype.resolveBody = function _mtResolveBody() {
      const out = origResolveBody.apply(this, arguments);
      try { if (estActif() && this.body) this.body.allowed_mentions = { parse: [] }; } catch {}
      return out;
    };

    // (2) Bloquer les MP aux membres réels. User.send / GuildMember.send passent
    //     tous par createDM() → DMChannel.send : un seul point suffit. Les
    //     testeurs (accès total) continuent de recevoir leurs MP.
    const origDMSend = DMChannel.prototype.send;
    DMChannel.prototype.send = function _mtDMSend(...args) {
      try {
        if (estActif()) {
          const id = this.recipientId || (this.recipient && this.recipient.id);
          if (!id || !(global.aAccesTotal && global.aAccesTotal(id))) return Promise.resolve(null);
        }
      } catch {}
      return origDMSend.apply(this, args);
    };

    _gardeInstallee = true;
    console.log('🧪 Garde Mode Test installée : pings coupés + MP aux membres bloqués quand le Mode Test est actif.');
  } catch (e) {
    console.log('⚠️ installerGardeAlertes:', e && e.message);
  }
}

module.exports = { estActif, setActif, prefixe, compter, purger, lignesEtat, routeInteraction, estDirection, installerGardeAlertes };
