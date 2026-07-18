// ═══════════════════════════════════════════════════════════════
// contact-web.js — Crée les fiches de contact demandées depuis le SITE
//
// L'espace interne du site propose un bouton « Nouveau contact » (même format
// que /contact sur Discord). La demande est enregistrée dans Supabase (table
// DemandeContact, statut « nouveau »). Ce module relève ces demandes, crée la
// VRAIE fiche via repertoire.ajouterContactAuto (carnet + post de forum), puis
// marque la demande « cree ». La fiche remonte ensuite sur le site par la synchro
// habituelle (table Contact).
//
// « Ne rien dérégler » : 100 % additif, best-effort, jamais bloquant. No-op sans
// les variables Supabase. La table DemandeContact est neuve et jamais réconciliée.
// ═══════════════════════════════════════════════════════════════

const { EmbedBuilder } = require('discord.js');
const supa = require('./supabase-sync');
let repertoire = null; try { repertoire = require('./repertoire'); } catch {}

const SALON_PANEL_CONTACT = '1518385544860667945'; // salon du panneau « Nouvelle fiche »

// Relève les demandes de contact du site et crée les fiches correspondantes.
async function verifierDemandesContactWeb(guild) {
  if (!guild || !repertoire?.ajouterContactAuto || !supa.lireDemandesContactWeb) return;
  let rows;
  try { rows = await supa.lireDemandesContactWeb(); } catch { return; }
  if (!Array.isArray(rows) || !rows.length) return;

  for (const d of rows) {
    try {
      const contact = await repertoire.ajouterContactAuto(guild, {
        nom: d.nom,
        telegramme: d.telegramme || '',
        metier: d.metier || '',
        secteur: d.secteur || '',
        affiliation: d.affiliation || '',
        relation: d.relation || '',
        fiabilite: d.fiabilite || 0,
        statut: d.statutRP || '',
        type: d.type || '',
        notes: d.notes || '',
        creeParNom: d.creeParNom || 'Site web',
      });
      if (contact) {
        await supa.marquerDemandeContactTraitee(d.id, contact.id);
        await _notifier(guild, contact, d).catch(() => {});
      } else {
        await supa.marquerDemandeContactEchec(d.id);
      }
    } catch (e) {
      console.log('⚠️ contact-web:', e.message);
      try { await supa.marquerDemandeContactEchec(d.id); } catch {}
    }
  }
}

// Petit mot dans le salon du carnet pour signaler qu'une fiche vient du site.
async function _notifier(guild, contact, d) {
  const ch = guild.channels.cache.get(SALON_PANEL_CONTACT)
    || (await guild.channels.fetch(SALON_PANEL_CONTACT).catch(() => null));
  if (!ch?.send) return;
  const e = new EmbedBuilder()
    .setColor(0x6B4F2A)
    .setTitle('🌐 Nouvelle fiche de contact — via le site')
    .setDescription(`**${contact.nom}** a été ajouté au carnet depuis le site${d.creeParNom ? ` par **${d.creeParNom}**` : ''}.`)
    .setFooter({ text: 'Iron Wolf Company · Le Carnet' })
    .setTimestamp();
  await ch.send({ embeds: [e] }).catch(() => {});
}

module.exports = { verifierDemandesContactWeb };
