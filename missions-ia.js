// ═══════════════════════════════════════════════════════════════
// missions-ia.js — Générateur de MISSIONS / CONTRATS RP par IA (Claude Haiku).
// La Direction clique → choisit un type → l'IA pond un scénario complet
// (titre, cible/client, contexte, objectif, prime suggérée, complications, camp)
// prêt à devenir un vrai contrat/avis. Module ISOLÉ (préfixe mission_), n'écrit
// RIEN en base. Repli sur un canevas statique si l'IA est absente → jamais de crash.
// ═══════════════════════════════════════════════════════════════
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, MessageFlags } = require('discord.js');

const GESTION = ['Opérateur', 'Operateur', 'Concepteur', 'Fléau', 'fleau', 'Fondateur', 'Directeur', 'Conseil', 'Officier', 'Secrétaire', 'Instructeur'];
function _estGestion(member) { try { return !!member?.roles?.cache?.some(r => GESTION.some(n => r.name.includes(n))); } catch { return false; } }

const TYPES = [
  { key: 'braquage', label: 'Braquage / Coup', emoji: '💰', camp: 'illegal' },
  { key: 'protection', label: 'Protection rapprochée', emoji: '🛡️', camp: 'legal' },
  { key: 'traque', label: 'Traque / Chasse de prime', emoji: '🎯', camp: 'legal' },
  { key: 'enquete', label: 'Enquête / Filature', emoji: '🔍', camp: 'legal' },
  { key: 'dette', label: 'Récupération de dette', emoji: '📜', camp: 'illegal' },
  { key: 'sabotage', label: 'Sabotage / Intimidation', emoji: '🔥', camp: 'illegal' },
  { key: 'escorte', label: 'Escorte de convoi', emoji: '🐎', camp: 'legal' },
  { key: 'libre', label: 'Surprends-moi (aléatoire)', emoji: '🎲', camp: 'both' },
];
const _type = k => TYPES.find(t => t.key === k) || TYPES[TYPES.length - 1];

// Canevas de secours (sans IA) : un minimum jouable, à étoffer par la Direction.
function _fallback(t) {
  const camp = t.camp === 'both' ? 'illegal' : t.camp;
  return {
    titre: t.label + ' — affaire à traiter',
    cible: '(à préciser)',
    contexte: 'Une affaire de type « ' + t.label.toLowerCase() + ' » se présente à la compagnie. Les détails restent à négocier avec le commanditaire.',
    objectif: 'Mener l\'opération à bien, proprement et sans laisser de traces inutiles.',
    prime: '(à fixer selon le risque)',
    complications: 'Un imprévu peut surgir : témoin gênant, loi aux trousses, ou double jeu du commanditaire.',
    camp,
  };
}

async function _genererMission(t) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return _fallback(t);
  try {
    const orient = t.camp === 'legal' ? 'plutôt du ressort LÉGAL (Iron Wolf Company : protection, escorte, enquête, prime).'
      : t.camp === 'illegal' ? 'plutôt du ressort CLANDESTIN (La Confrérie : on vole les riches pour les pauvres, jamais les civils).'
        : 'au choix, légal ou clandestin selon ce qui rend le mieux.';
    const prompt = `Jeu de rôle Far West (RedM / RDR2), Ouest américain vers 1899-1904. Une organisation (Iron Wolf Company au grand jour, La Confrérie dans l'ombre — des hors-la-loi à la Robin des bois : on vole les riches, on épargne les civils) reçoit des contrats.
Invente UN scénario de mission ORIGINAL et crédible de type « ${t.label} », ${orient}
Reste sobre et immersif, aucun anachronisme, aucun emoji, des noms et lieux d'époque plausibles (villes de RDR2 : Valentine, Saint-Denis, Rhodes, Blackwater, Van Horn, Strawberry, Armadillo…).
Réponds STRICTEMENT en JSON valide, une seule ligne, avec EXACTEMENT ces clés (valeurs en français, courtes) :
{"titre":"...","cible":"nom de la cible ou du client","contexte":"2-3 phrases de mise en situation","objectif":"ce qu'il faut accomplir, 1 phrase","prime":"montant en dollars d'époque, ex 800$","complications":"un risque/twist, 1 phrase","camp":"legal|illegal"}
UNIQUEMENT le JSON, rien d'autre.`;
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 600, messages: [{ role: 'user', content: prompt }] }),
    });
    if (!resp.ok) return _fallback(t);
    const data = await resp.json();
    const raw = (data?.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim();
    const mjson = raw.match(/\{[\s\S]*\}/);
    if (!mjson) return _fallback(t);
    const o = JSON.parse(mjson[0]);
    return {
      titre: String(o.titre || t.label).slice(0, 200),
      cible: String(o.cible || '(à préciser)').slice(0, 200),
      contexte: String(o.contexte || '').slice(0, 700),
      objectif: String(o.objectif || '').slice(0, 400),
      prime: String(o.prime || '(à fixer)').slice(0, 100),
      complications: String(o.complications || '').slice(0, 400),
      camp: (o.camp === 'legal' || o.camp === 'illegal') ? o.camp : (t.camp === 'both' ? 'illegal' : t.camp),
    };
  } catch (e) { console.log('⚠️ missions-ia:', e.message); return _fallback(t); }
}

function _missionEmbed(m, t) {
  const legal = m.camp === 'legal';
  const e = new EmbedBuilder()
    .setColor(legal ? 0xC8A45C : 0x7C2C22)
    .setTitle((t.emoji || '🎯') + '  ' + m.titre)
    .setDescription(m.contexte || '—')
    .addFields(
      { name: '🎯 ' + (legal ? 'Client' : 'Cible'), value: m.cible || '—', inline: true },
      { name: '🏷️ Type', value: t.label, inline: true },
      { name: legal ? '⚖️ Iron Wolf Company (légal)' : '🐺 La Confrérie (clandestin)', value: '​', inline: true },
      { name: '📌 Objectif', value: m.objectif || '—' },
      { name: '💵 Prime suggérée', value: m.prime || '—', inline: true },
      { name: '⚠️ Complication', value: m.complications || '—' },
    )
    .setFooter({ text: 'Scénario généré — à valider/ajuster avant d\'en faire un vrai contrat ou avis.' });
  return e;
}

function _panelPayload() {
  const embed = new EmbedBuilder().setColor(0xC8A45C).setTitle('🎯 GÉNÉRATEUR DE MISSIONS')
    .setDescription([
      '*Panne d\'inspiration pour lancer du RP ? La Direction génère ici un **scénario de mission** clé en main — cible/client, contexte, objectif, prime et complication — prêt à devenir un vrai contrat ou avis.*',
      '',
      '👉 **Générer une mission** ci-dessous, choisis un type, et ajuste ce que l\'IA propose.',
    ].join('\n'))
    .setFooter({ text: 'Iron Wolf Company · Réservé à la Direction' });
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('mission_gen').setLabel('Générer une mission').setEmoji('🎯').setStyle(ButtonStyle.Success),
  );
  return { embeds: [embed], components: [row] };
}

async function installerPanelMissions(guild, channelId) {
  try {
    const ch = await guild.channels.fetch(channelId).catch(() => null);
    if (!ch?.messages || typeof ch.send !== 'function') return null;
    const me = guild.client.user.id;
    const estPanel = m => m.author?.id === me && (m.embeds?.[0]?.title || '').includes('GÉNÉRATEUR DE MISSIONS');
    let existing = null;
    const pins = await ch.messages.fetchPinned().catch(() => null);
    if (pins) existing = [...pins.values()].find(estPanel) || null;
    if (!existing) { const msgs = await ch.messages.fetch({ limit: 50 }).catch(() => null); if (msgs) existing = [...msgs.values()].find(estPanel) || null; }
    if (existing) { await existing.edit(_panelPayload()).catch(() => {}); return existing; }
    const sent = await ch.send(_panelPayload()).catch(() => null);
    if (sent) await sent.pin().catch(() => {});
    return sent;
  } catch (e) { console.log('⚠️ panneau missions:', e.message); return null; }
}

function _menuTypes() {
  return new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('mission_type').setPlaceholder('Type de mission à générer…')
    .addOptions(TYPES.map(t => ({ label: t.label, value: t.key, emoji: t.emoji }))));
}
function _rowRegen(typeKey) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('mission_regen::' + typeKey).setLabel('Régénérer').setEmoji('🔄').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('mission_type_new').setLabel('Autre type').setEmoji('🎛️').setStyle(ButtonStyle.Secondary),
  );
}

async function routeInteraction(interaction) {
  try {
    const id = interaction.customId || '';
    if (!id.startsWith('mission_')) return false;
    const eph = MessageFlags.Ephemeral;

    if (interaction.isButton() && (id === 'mission_gen' || id === 'mission_type_new')) {
      if (!_estGestion(interaction.member)) { await interaction.reply({ content: '🔒 Réservé à la Direction.', flags: eph }); return true; }
      if (id === 'mission_type_new') { await interaction.update({ content: '🎯 **Choisis un type de mission :**', embeds: [], components: [_menuTypes()] }).catch(() => {}); return true; }
      await interaction.reply({ content: '🎯 **Choisis un type de mission :**', components: [_menuTypes()], flags: eph }); return true;
    }
    if (interaction.isStringSelectMenu() && id === 'mission_type') {
      if (!_estGestion(interaction.member)) { await interaction.update({ content: '🔒 Réservé à la Direction.', components: [] }).catch(() => {}); return true; }
      await interaction.deferUpdate().catch(() => {});
      const t = _type(interaction.values[0]);
      const m = await _genererMission(t);
      await interaction.editReply({ content: '✅ Scénario proposé — ajuste-le, puis crée le contrat/avis à la main.', embeds: [_missionEmbed(m, t)], components: [_rowRegen(t.key)] }).catch(() => {});
      return true;
    }
    if (interaction.isButton() && id.startsWith('mission_regen::')) {
      if (!_estGestion(interaction.member)) { await interaction.reply({ content: '🔒 Réservé à la Direction.', flags: eph }); return true; }
      await interaction.deferUpdate().catch(() => {});
      const t = _type(id.split('::')[1]);
      const m = await _genererMission(t);
      await interaction.editReply({ content: '🔄 Nouveau scénario :', embeds: [_missionEmbed(m, t)], components: [_rowRegen(t.key)] }).catch(() => {});
      return true;
    }
    return true;
  } catch (e) {
    console.log('❌ missions-ia routeInteraction:', e.message);
    try { if (!interaction.replied && !interaction.deferred) await interaction.reply({ content: '❌ Erreur au générateur de missions.', flags: MessageFlags.Ephemeral }); } catch {}
    return true;
  }
}

module.exports = { routeInteraction, installerPanelMissions, _test: { _genererMission, _fallback, _missionEmbed, TYPES } };
