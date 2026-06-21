// ═══════════════════════════════════════════════════════════════
// traque.js — Avis de recherche / chasse à l'homme (mercenaires IWC)
// Créer une cible, signaler des pistes, rejoindre la traque comme
// chasseur, clôturer (capturée / éliminée / abandonnée) + prime.
// Branchement index.js : require + traqueCommands + routeInteraction.
// ═══════════════════════════════════════════════════════════════
const {
  EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, SlashCommandBuilder, MessageFlags,
} = require('discord.js');
const { loadDB, saveDB } = require('./db');

const CH_JOURNAL = '1508756535407542372';
const RESP_ROLES = ['Concepteur', 'Fléau', 'Fondateur', 'Directeur', 'Conseil', 'Officier', 'Instructeur'];

const STATUTS = {
  chasse:     { label: '🟠 En chasse',   couleur: 0xE67E22 },
  reperee:    { label: '🔵 Repérée',     couleur: 0x3498DB },
  capturee:   { label: '✅ Capturée',    couleur: 0x57F287 },
  eliminee:   { label: '💀 Éliminée',    couleur: 0xED4245 },
  abandonnee: { label: '⚫ Abandonnée',  couleur: 0x555555 },
};
const DANGER = {
  faible: '🟢 Faible', moyen: '🟡 Moyen', eleve: '🟠 Élevé', extreme: '🔴 Extrême',
};

const traqueCommands = [
  new SlashCommandBuilder().setName('avis-recherche').setDescription('🎯 Lancer un avis de recherche (traque une cible)'),
  new SlashCommandBuilder().setName('traques').setDescription('🎯 Voir les avis de recherche en cours'),
  new SlashCommandBuilder().setName('signalement').setDescription("📋 Signalement détaillé d'une cible à partir d'une photo")
    .addAttachmentOption(o => o.setName('photo').setDescription('Capture de la personne en jeu').setRequired(true))
    .addStringOption(o => o.setName('cible').setDescription('Nom / identité de la cible (optionnel)').setRequired(false)),
];

// ─── Helpers ───
function estResponsable(member) {
  return !!member?.roles?.cache?.some(r => RESP_ROLES.some(n => r.name.includes(n)));
}
function journalCh(guild) {
  if (typeof global.getJournalCh === 'function') { try { const c = global.getJournalCh(guild); if (c) return c; } catch {} }
  return guild.channels.cache.get(CH_JOURNAL) || null;
}
function fmtDate(d) { if (!d) return '—'; const dt = new Date(d); return isNaN(dt.getTime()) ? String(d) : dt.toLocaleDateString('fr-FR'); }
function findTraque(db, id) { return (db.traques || []).find(t => t.id === id); }
function dangerLabel(v) { return DANGER[v] || '🟡 Moyen'; }

// ─── Signalement par photo (vision IA) ───
const PROMPT_SIGNALEMENT = `Tu rédiges un SIGNALEMENT (avis de recherche) à partir d'une capture d'écran d'un personnage dans un jeu vidéo Far West (RedM / Red Dead Redemption 2). C'est un personnage de jeu fictif.
Décris UNIQUEMENT ce qui est réellement visible sur l'image. N'invente rien : si un élément n'est pas visible, mets "Non visible".
Réponds UNIQUEMENT avec un objet JSON valide, sans aucun texte ni balise autour, au format EXACT :
{"allure":"sexe apparent, corpulence, allure générale","visage":"cheveux (couleur/longueur), barbe ou moustache, traits marquants, cicatrices visibles","chapeau":"type et couleur du chapeau ou couvre-chef, sinon Non visible","tenue":"vêtements visibles avec leurs couleurs : manteau, chemise, gilet, pantalon, bottes, foulard/bandana","armes":"armes visibles (revolver, fusil, couteau, holster...), sinon Aucune visible","distinctifs":"signes particuliers : accessoires, masque, badge, sacoche, bijoux, tatouages, objets portés","monture":"description du cheval si visible, sinon Non visible","dangerosite":"faible|moyen|eleve|extreme","resume":"une phrase de synthèse façon avis de recherche"}
Écris en français, de façon factuelle et concise.`;

async function _imageBytes(url) {
  try { const r = await fetch(url); if (!r.ok) return null; return Buffer.from(await r.arrayBuffer()); } catch { return null; }
}
async function _callVisionSignal(model, b64, mt) {
  const apiKey = process.env.ANTHROPIC_API_KEY; if (!apiKey) return null;
  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model, max_tokens: 1200, messages: [{ role: 'user', content: [
        { type: 'image', source: { type: 'base64', media_type: mt || 'image/png', data: b64 } },
        { type: 'text', text: PROMPT_SIGNALEMENT },
      ] }] }),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    return (data?.content?.[0]?.text || "");
  } catch { return null; }
}
function _parseSignal(txt) {
  if (!txt) return null;
  txt = String(txt).trim().replace(/```json/gi, "").replace(/```/g, "").trim();
  const m = txt.match(/\{[\s\S]*\}/); if (!m) return null;
  try { const o = JSON.parse(m[0]); return (o && typeof o === 'object') ? o : null; } catch { return null; }
}
async function _analyserSignalement(b64, mt) {
  let txt = await _callVisionSignal('claude-sonnet-4-6', b64, mt);
  if (!txt) txt = await _callVisionSignal('claude-haiku-4-5-20251001', b64, mt);
  return _parseSignal(txt);
}
function _signalementTexte(s) {
  const ok = v => v && !/non visible|aucune visible/i.test(String(v));
  const parts = [];
  if (ok(s.allure)) parts.push(String(s.allure));
  if (ok(s.visage)) parts.push(String(s.visage));
  if (ok(s.chapeau)) parts.push('Chapeau : ' + s.chapeau);
  if (ok(s.tenue)) parts.push('Tenue : ' + s.tenue);
  if (ok(s.armes)) parts.push('Armé : ' + s.armes);
  if (ok(s.distinctifs)) parts.push('Signes : ' + s.distinctifs);
  let txt = parts.join('. ');
  if (!txt) txt = String(s.resume || "Signalement établi d'après la photo.");
  return txt.slice(0, 480);
}
function buildSignalementEmbed(s, cible, photoUrl, auteur) {
  const dKey = DANGER[s.dangerosite] ? s.dangerosite : parseDanger(s.dangerosite);
  const field = (n, v, inline) => ({ name: n, value: String(v || 'Non visible').slice(0, 1024) || 'Non visible', inline: !!inline });
  const e = new EmbedBuilder()
    .setColor(0x8B5A2B)
    .setTitle(`📋 SIGNALEMENT${cible ? ' — ' + cible : ''}`)
    .setDescription(s.resume ? `*${String(s.resume).slice(0, 400)}*` : "*Signalement établi d'après la photo.*")
    .addFields(
      field('🧍 Allure', s.allure, false),
      field('👤 Visage', s.visage, false),
      field('🤠 Chapeau', s.chapeau, true),
      field('🔫 Armes', s.armes, true),
      field('🧥 Tenue', s.tenue, false),
      field('🔎 Signes distinctifs', s.distinctifs, false),
      { name: '⚠️ Dangerosité estimée', value: dangerLabel(dKey), inline: true },
    );
  if (s.monture && !/non visible/i.test(String(s.monture))) e.addFields(field('🐴 Monture', s.monture, false));
  if (photoUrl) e.setThumbnail(photoUrl);
  e.setFooter({ text: `IWC • Signalement établi par ${auteur} • généré par l'IA d'après la photo` });
  return e;
}

// ─── Affichage de l'avis (poster) ───
function buildPoster(t) {
  const st = STATUTS[t.status] || STATUTS.chasse;
  const closed = ['capturee', 'eliminee', 'abandonnee'].includes(t.status);
  const chasseurs = (t.chasseurs || []).length ? t.chasseurs.map(id => `<@${id}>`).join(', ') : '*Aucun chasseur assigné*';
  const pistes = (t.pistes || []).slice(-5).reverse();
  const pistesTxt = pistes.length
    ? pistes.map(p => `• ${fmtDate(p.at)} — ${p.lieu ? `📍 **${p.lieu}** · ` : ''}${p.info || ''}${p.par ? ` _(${p.par})_` : ''}`).join('\n').slice(0, 1024)
    : '*Aucune piste signalée.*';
  const e = new EmbedBuilder()
    .setColor(st.couleur)
    .setTitle(`🎯 AVIS DE RECHERCHE — ${t.cible}`)
    .setDescription(t.signalement ? `*${String(t.signalement).slice(0, 500)}*` : '*Pas de signalement.*')
    .addFields(
      { name: '📍 Dernière position', value: t.position || '—', inline: true },
      { name: '⚠️ Dangerosité', value: dangerLabel(t.dangerosite), inline: true },
      { name: '💰 Prime', value: t.prime || '—', inline: true },
      { name: '👤 Commanditaire', value: t.commanditaire || '—', inline: true },
      { name: '🎯 Consigne', value: t.vivantMort || 'Indifférent', inline: true },
      { name: '📌 Statut', value: st.label, inline: true },
      { name: '🤠 Chasseurs', value: chasseurs, inline: false },
      { name: `🧭 Pistes (${(t.pistes || []).length})`, value: pistesTxt, inline: false },
    )
    .setFooter({ text: `IWC • Avis ${t.id}${closed && t.resultat ? ' • ' + t.resultat : ''}` });
  if (t.photo) e.setThumbnail(t.photo);
  if (t.createdAt) e.setTimestamp(new Date(t.createdAt));
  return e;
}
function buildBoutons(t) {
  const closed = ['capturee', 'eliminee', 'abandonnee'].includes(t.status);
  if (closed) {
    return [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`traque_noop::${t.id}`).setLabel('Traque clôturée').setEmoji('🔒').setStyle(ButtonStyle.Secondary).setDisabled(true),
    )];
  }
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`traque_piste::${t.id}`).setLabel('Signaler une piste').setEmoji('🧭').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`traque_chasseur::${t.id}`).setLabel('Rejoindre la traque').setEmoji('🤠').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`traque_cloturer::${t.id}`).setLabel('Clôturer').setEmoji('✅').setStyle(ButtonStyle.Danger),
  )];
}

// ─── Mise à jour du message d'origine ───
async function rafraichir(guild, t) {
  if (!t.messageId || !t.channelId) return;
  try {
    const ch = await guild.channels.fetch(t.channelId).catch(() => null);
    if (!ch) return;
    const msg = await ch.messages.fetch(t.messageId).catch(() => null);
    if (msg) await msg.edit({ embeds: [buildPoster(t)], components: buildBoutons(t) }).catch(() => {});
  } catch {}
}

// ─── Création : modal ───
function modalCreation(def, sid) {
  def = def || {};
  const m = new ModalBuilder().setCustomId(sid ? `traque_create_modal::${sid}` : 'traque_create_modal').setTitle('🎯 Nouvel avis de recherche');
  const cibleInput = new TextInputBuilder().setCustomId('cible').setLabel('Cible (nom / identité)').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Ex : Cole Bradford, le contrebandier');
  if (def.cible) cibleInput.setValue(String(def.cible).slice(0, 100));
  const signInput = new TextInputBuilder().setCustomId('signalement').setLabel('Signalement (description, délit)').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(500).setPlaceholder('Apparence, méfaits, raison de la traque...');
  if (def.signalement) signInput.setValue(String(def.signalement).slice(0, 500));
  m.addComponents(
    new ActionRowBuilder().addComponents(cibleInput),
    new ActionRowBuilder().addComponents(signInput),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('position').setLabel('Dernière position connue').setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder('Armadillo, Tumbleweed, Fort Mercer, Rio Bravo...')),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('prime').setLabel('Prime + dangerosité').setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder('Ex : 500 $ · élevé  (faible/moyen/élevé/extrême)')),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('infos').setLabel('Commanditaire + vivant/mort').setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder('Ex : Shérif de Armadillo · Vivant de préférence')),
  );
  return m;
}
function parseDanger(txt) {
  const s = String(txt || '').toLowerCase();
  if (s.includes('extr')) return 'extreme';
  if (s.includes('élev') || s.includes('elev') || s.includes('haut')) return 'eleve';
  if (s.includes('faible') || s.includes('bas')) return 'faible';
  return 'moyen';
}

async function handleCreateModal(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const sid = (interaction.customId.split('::')[1]) || null;
  const cible = interaction.fields.getTextInputValue('cible').trim();
  const primeRaw = interaction.fields.getTextInputValue('prime') || '';
  const infosRaw = interaction.fields.getTextInputValue('infos') || '';
  const prime = primeRaw.split(/[·|]/)[0].trim() || '—';
  const commanditaire = infosRaw.split(/[·|]/)[0].trim() || '—';
  const vivantMort = (infosRaw.split(/[·|]/)[1] || '').trim() || 'Indifférent';
  const db = loadDB();
  if (!db.traques) db.traques = [];
  const stash = sid && db._signalements ? db._signalements[sid] : null;
  let dangerosite = parseDanger(primeRaw);
  if (stash && stash.dangerosite && !/(faible|moyen|élev|elev|extr|haut|bas)/i.test(primeRaw)) dangerosite = stash.dangerosite;
  const t = {
    id: 'AR-' + Date.now().toString().slice(-5),
    cible,
    signalement: interaction.fields.getTextInputValue('signalement') || '',
    position: (interaction.fields.getTextInputValue('position') || '').trim() || '—',
    prime, dangerosite, commanditaire, vivantMort,
    status: 'chasse',
    chasseurs: [], pistes: [],
    createdAt: new Date().toISOString(),
    createdBy: interaction.user.username,
    channelId: interaction.channelId,
  };
  if (stash && stash.photoUrl) t.photo = stash.photoUrl;
  const sent = await interaction.channel.send({ embeds: [buildPoster(t)], components: buildBoutons(t) }).catch(() => null);
  if (sent) t.messageId = sent.id;
  db.traques.push(t);
  if (sid && db._signalements) delete db._signalements[sid];
  saveDB(db);
  const jc = journalCh(interaction.guild);
  if (jc) await jc.send({ embeds: [new EmbedBuilder().setColor(0xE67E22).setTitle(`🎯 Avis de recherche lancé — ${t.cible}`).setDescription(`Prime : **${t.prime}** · Dangerosité : ${dangerLabel(t.dangerosite)}\nLancé par ${t.createdBy}`).setFooter({ text: `IWC • ${t.id}` }).setTimestamp()] }).catch(() => {});
  await interaction.editReply({ content: `✅ Avis de recherche **${t.id}** publié pour **${cible}**.` });
}

// ─── Piste : modal ───
async function handlePisteButton(interaction) {
  const id = interaction.customId.split('::')[1];
  const m = new ModalBuilder().setCustomId(`traque_piste_modal::${id}`).setTitle('🧭 Signaler une piste');
  m.addComponents(
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('lieu').setLabel('Lieu (où la cible a été vue)').setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder('Ex : saloon de Tumbleweed')),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('info').setLabel('Info / détails').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(400).setPlaceholder('Ce que tu as vu, entendu, appris...')),
  );
  return interaction.showModal(m);
}
async function handlePisteModal(interaction) {
  const id = interaction.customId.split('::')[1];
  const db = loadDB();
  const t = findTraque(db, id);
  if (!t) return interaction.reply({ content: '❌ Avis introuvable.', flags: MessageFlags.Ephemeral });
  if (!Array.isArray(t.pistes)) t.pistes = [];
  t.pistes.push({ lieu: (interaction.fields.getTextInputValue('lieu') || '').trim(), info: interaction.fields.getTextInputValue('info').trim(), par: interaction.user.username, at: new Date().toISOString() });
  saveDB(db);
  await rafraichir(interaction.guild, t);
  return interaction.reply({ content: '✅ Piste enregistrée. Merci, chasseur.', flags: MessageFlags.Ephemeral });
}

// ─── Rejoindre la traque ───
async function handleChasseurButton(interaction) {
  const id = interaction.customId.split('::')[1];
  const db = loadDB();
  const t = findTraque(db, id);
  if (!t) return interaction.reply({ content: '❌ Avis introuvable.', flags: MessageFlags.Ephemeral });
  if (!Array.isArray(t.chasseurs)) t.chasseurs = [];
  const dejaLa = t.chasseurs.includes(interaction.user.id);
  if (dejaLa) t.chasseurs = t.chasseurs.filter(x => x !== interaction.user.id);
  else t.chasseurs.push(interaction.user.id);
  saveDB(db);
  await rafraichir(interaction.guild, t);
  return interaction.reply({ content: dejaLa ? '↩️ Tu t\'es retiré de la traque.' : '🤠 Tu as rejoint la traque !', flags: MessageFlags.Ephemeral });
}

// ─── Clôture ───
async function handleCloturerButton(interaction) {
  if (!estResponsable(interaction.member)) return interaction.reply({ content: '❌ Seul un responsable peut clôturer un avis.', flags: MessageFlags.Ephemeral });
  const id = interaction.customId.split('::')[1];
  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder().setCustomId(`traque_cloture_select::${id}`).setPlaceholder('Résultat de la traque...').addOptions(
      { label: 'Capturée', value: 'capturee', emoji: '✅', description: 'Cible capturée vivante' },
      { label: 'Éliminée', value: 'eliminee', emoji: '💀', description: 'Cible éliminée' },
      { label: 'Abandonnée', value: 'abandonnee', emoji: '⚫', description: 'Traque abandonnée' },
    ),
  );
  return interaction.reply({ content: `Clôture de l'avis **${id}** — choisis le résultat :`, components: [row], flags: MessageFlags.Ephemeral });
}
async function handleClotureSelect(interaction) {
  const id = interaction.customId.split('::')[1];
  const choix = interaction.values[0];
  const db = loadDB();
  const t = findTraque(db, id);
  if (!t) return interaction.update({ content: '❌ Avis introuvable.', components: [] });
  t.status = choix;
  t.closedAt = new Date().toISOString();
  t.resultat = (STATUTS[choix] || {}).label || choix;
  const prime = choix === 'capturee' || choix === 'eliminee' ? t.prime : null;
  saveDB(db);
  await rafraichir(interaction.guild, t);
  const jc = journalCh(interaction.guild);
  if (jc) await jc.send({ embeds: [new EmbedBuilder().setColor((STATUTS[choix] || {}).couleur || 0x555555).setTitle(`🎯 Avis clôturé — ${t.cible}`).setDescription(`Résultat : **${t.resultat}**${prime ? `\n💰 Prime à verser : **${prime}**` : ''}\nChasseurs : ${(t.chasseurs || []).map(x => `<@${x}>`).join(', ') || '—'}`).setFooter({ text: `IWC • ${t.id}` }).setTimestamp()] }).catch(() => {});
  return interaction.update({ content: `✅ Avis **${id}** clôturé : ${t.resultat}.${prime ? ` Pense à verser la prime (${prime}) aux chasseurs via ton système d'économie.` : ''}`, components: [] });
}

// ─── Liste des traques en cours ───
async function handleListe(interaction) {
  const db = loadDB();
  const actifs = (db.traques || []).filter(t => ['chasse', 'reperee'].includes(t.status));
  const e = new EmbedBuilder().setColor(0xE67E22).setTitle('🎯 Avis de recherche en cours').setFooter({ text: `IWC • ${actifs.length} traque(s) active(s)` });
  if (!actifs.length) e.setDescription('*Aucune traque en cours.*');
  else e.setDescription(actifs.slice(0, 20).map(t => {
    const st = STATUTS[t.status] || STATUTS.chasse;
    return `${st.label} \`${t.id}\` — **${t.cible}** · 📍 ${t.position} · 💰 ${t.prime} · 🤠 ${(t.chasseurs || []).length}`;
  }).join('\n').slice(0, 4000));
  return interaction.reply({ embeds: [e], flags: MessageFlags.Ephemeral });
}

// ─── Signalement par photo : commande + bouton ───
async function handleSignalement(interaction) {
  if (!estResponsable(interaction.member)) { await interaction.reply({ content: '❌ Le signalement est réservé aux responsables.', flags: MessageFlags.Ephemeral }); return; }
  const photo = interaction.options.getAttachment('photo');
  const cible = (interaction.options.getString('cible') || '').trim();
  if (!photo || !((photo.contentType || '').startsWith('image'))) { await interaction.reply({ content: "❌ Joins une **image** (capture de la personne en jeu).", flags: MessageFlags.Ephemeral }); return; }
  await interaction.deferReply();
  const buf = await _imageBytes(photo.url);
  if (!buf) { await interaction.editReply({ content: "❌ Impossible de lire l'image. Réessaie." }); return; }
  const s = await _analyserSignalement(buf.toString('base64'), photo.contentType || 'image/png');
  if (!s) { await interaction.editReply({ content: "❌ Je n'ai pas réussi à établir un signalement. Essaie une capture plus nette, où on voit bien la personne." }); return; }
  const db = loadDB();
  if (!db._signalements) db._signalements = {};
  for (const k of Object.keys(db._signalements)) { if (Date.now() - (db._signalements[k].at || 0) > 7200000) delete db._signalements[k]; }
  const sid = (Date.now().toString(36) + Math.random().toString(36).slice(2, 5)).slice(-8);
  db._signalements[sid] = { cible, signalement: _signalementTexte(s), dangerosite: (DANGER[s.dangerosite] ? s.dangerosite : parseDanger(s.dangerosite)), photoUrl: photo.url, createdBy: interaction.user.username, at: Date.now() };
  saveDB(db);
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`traque_from_signal::${sid}`).setLabel("Créer l'avis de recherche").setEmoji('📌').setStyle(ButtonStyle.Danger),
  );
  await interaction.editReply({ embeds: [buildSignalementEmbed(s, cible, photo.url, interaction.user.username)], components: [row] });
}
async function handleFromSignal(interaction) {
  if (!estResponsable(interaction.member)) { await interaction.reply({ content: '❌ Réservé aux responsables.', flags: MessageFlags.Ephemeral }); return; }
  const sid = interaction.customId.split('::')[1];
  const stash = (loadDB()._signalements || {})[sid];
  if (!stash) { await interaction.reply({ content: "⏱️ Ce signalement a expiré. Relance /signalement avec la photo.", flags: MessageFlags.Ephemeral }); return; }
  await interaction.showModal(modalCreation({ cible: stash.cible, signalement: stash.signalement }, sid));
}

// ─── Routage ───
async function routeInteraction(interaction) {
  if (interaction.isChatInputCommand?.()) {
    if (interaction.commandName === 'avis-recherche') {
      if (!estResponsable(interaction.member)) { await interaction.reply({ content: '❌ Lancer un avis de recherche est réservé aux responsables.', flags: MessageFlags.Ephemeral }); return true; }
      await interaction.showModal(modalCreation());
      return true;
    }
    if (interaction.commandName === 'traques') { await handleListe(interaction); return true; }
    if (interaction.commandName === 'signalement') { await handleSignalement(interaction); return true; }
  }
  if (interaction.isButton?.()) {
    const cid = interaction.customId || '';
    if (cid.startsWith('traque_piste::'))     { await handlePisteButton(interaction); return true; }
    if (cid.startsWith('traque_chasseur::'))  { await handleChasseurButton(interaction); return true; }
    if (cid.startsWith('traque_cloturer::'))  { await handleCloturerButton(interaction); return true; }
    if (cid.startsWith('traque_from_signal::')) { await handleFromSignal(interaction); return true; }
    if (cid.startsWith('traque_noop::'))      { await interaction.deferUpdate().catch(() => {}); return true; }
  }
  if (interaction.isStringSelectMenu?.() && (interaction.customId || '').startsWith('traque_cloture_select::')) { await handleClotureSelect(interaction); return true; }
  if (interaction.isModalSubmit?.()) {
    if (interaction.customId === 'traque_create_modal' || (interaction.customId || '').startsWith('traque_create_modal::')) { await handleCreateModal(interaction); return true; }
    if ((interaction.customId || '').startsWith('traque_piste_modal::')) { await handlePisteModal(interaction); return true; }
  }
  return false;
}

module.exports = { traqueCommands, routeInteraction };
