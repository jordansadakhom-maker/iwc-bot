// ═══════════════════════════════════════════════════════════════
// licences-web.js — Notifie dans Discord les évènements du REGISTRE DES LICENCES
//
// Le site (onglet « Licences ») journalise chaque action dans la table
// LicenceEvent. Ce module relève les évènements non encore annoncés
// (annonceAt IS NULL), les poste dans le salon Discord des licences, puis les
// marque annoncés. Un digest quotidien liste en plus les licences à renouveler.
//
// « Ne rien dérégler » : 100 % additif, best-effort, jamais bloquant. No-op tant
// que le salon (SALON_LICENCES) n'est pas configuré ou que Supabase est absent.
//
// ⚙️ CONFIG : définis la variable d'environnement SALON_LICENCES avec l'ID du
//    salon Discord où poster (clic droit sur le salon → « Copier l'identifiant »).
// ═══════════════════════════════════════════════════════════════

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const supa = require('./supabase-sync');

const SALON_LICENCES = process.env.SALON_LICENCES || '';
const SITE = (process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || process.env.SITE_URL || 'https://iwc-bot-psi.vercel.app').replace(/\/+$/, '');

const META = {
  creation:      { color: 0x3d8f68, emoji: '🆕', titre: 'Nouvelle licence délivrée' },
  suspension:    { color: 0xd8a53f, emoji: '⏸️', titre: 'Licence suspendue' },
  reactivation:  { color: 0x54b085, emoji: '▶️', titre: 'Licence réactivée' },
  revocation:    { color: 0xb0413a, emoji: '⛔', titre: 'Licence révoquée' },
  renouvellement:{ color: 0x6f9fc4, emoji: '🔁', titre: 'Licence renouvelée' },
  refus:         { color: 0xcf4d40, emoji: '🚫', titre: 'Tentative d’achat refusée' },
};

const _dateFR = (v) => { try { return new Date(v).toLocaleDateString('fr-FR'); } catch { return '—'; } };
function _lien() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Ouvrir le registre').setEmoji('➡️').setURL(SITE + '/licences'),
  );
}
async function _salon(guild) {
  if (!SALON_LICENCES) return null;
  return guild.channels.cache.get(SALON_LICENCES) || (await guild.channels.fetch(SALON_LICENCES).catch(() => null));
}

// Relève les évènements du registre et les poste dans le salon des licences.
async function verifierNotificationsLicences(guild) {
  if (!guild || !SALON_LICENCES || !supa.lireEvenementsLicenceANotifier) return;
  let rows;
  try { rows = await supa.lireEvenementsLicenceANotifier(); } catch { return; }
  if (!Array.isArray(rows) || !rows.length) return;
  const ch = await _salon(guild);
  if (!ch?.send) return;

  for (const ev of rows) {
    let envoye = false;
    try {
      const m = META[ev.type] || { color: 0x6b4f2a, emoji: 'ℹ️', titre: String(ev.type || 'Évènement') };
      const d = (ev.details && typeof ev.details === 'object') ? ev.details : {};
      const lignes = [];
      if (ev.numero) lignes.push(`**Numéro :** \`${ev.numero}\``);
      if (d.nom) lignes.push(`**Titulaire :** ${d.nom}`);
      if (d.acquereur) lignes.push(`**Acquéreur :** ${d.acquereur}`);
      if (d.motif) lignes.push(`**Motif :** ${d.motif}`);
      if (d.nouvelleExpiration) lignes.push(`**Nouvelle expiration :** ${_dateFR(d.nouvelleExpiration)}`);
      if (ev.par) lignes.push(`*par ${ev.par}*`);
      const e = new EmbedBuilder()
        .setColor(m.color)
        .setTitle(`${m.emoji} ${m.titre}`)
        .setDescription(lignes.join('\n') || '—')
        .setFooter({ text: 'Iron Wolf Company · Registre des licences' })
        .setTimestamp(new Date(ev.at || Date.now()));
      await ch.send({ embeds: [e], components: [_lien()] });
      envoye = true;
    } catch (err) {
      console.log('⚠️ licences-web (envoi):', err.message);
    }
    // Marque « annoncé » UNIQUEMENT après un envoi réussi : un échec Discord est
    // réessayé au cycle suivant (2 min) au lieu d'être perdu définitivement.
    if (envoye) { try { await supa.marquerEvenementLicenceAnnonce(ev.id); } catch {} }
  }
}

// Digest quotidien : licences expirant sous 30 jours (ou expirées).
async function verifierExpirationsLicences(guild) {
  if (!guild || !SALON_LICENCES || !supa.lireLicencesExpirant) return;
  let rows;
  try { rows = await supa.lireLicencesExpirant(); } catch { return; }
  if (!Array.isArray(rows) || !rows.length) return;
  const now = Date.now();
  const proches = [];
  for (const l of rows) {
    const t = Date.parse(l.dateExpiration);
    if (!Number.isFinite(t)) continue;
    const j = Math.ceil((t - now) / 86400000);
    if (j <= 30) proches.push({ l, j });
  }
  if (!proches.length) return;
  proches.sort((a, b) => a.j - b.j);
  const ch = await _salon(guild);
  if (!ch?.send) return;

  const ligne = ({ l, j }) => `${j < 0 ? '🔴' : j <= 7 ? '🟠' : '🟡'} \`${l.numero}\` — ${l.nom}${l.prenom ? ' ' + l.prenom : ''} · ${j < 0 ? 'expirée' : j + ' j'}`;
  const e = new EmbedBuilder()
    .setColor(0xd8a53f)
    .setTitle('📅 Licences à renouveler')
    .setDescription(proches.slice(0, 40).map(ligne).join('\n'))
    .setFooter({ text: `Iron Wolf Company · ${proches.length} licence(s) sous 30 jours` })
    .setTimestamp();
  await ch.send({ embeds: [e], components: [_lien()] }).catch(() => {});
}

module.exports = { verifierNotificationsLicences, verifierExpirationsLicences };
