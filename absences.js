// ───────────────────────────────────────────────────────────────────────────
//  absences.js — Tableau clair des absences (lecture seule)
//  /absences → qui est absent, retour prévu, raison + les absences à venir.
//  N'écrit RIEN : se base sur les statuts déjà gérés dans db.members
//  (status, absentJusqu, absentRaison, absenceProgrammee). Le retour
//  automatique à la date prévue est déjà assuré ailleurs dans le bot.
// ───────────────────────────────────────────────────────────────────────────
const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');

let dbMod = {};
try { dbMod = require('./db'); } catch { dbMod = {}; }
const loadDB = dbMod.loadDB || (() => ({}));

const absencesCommands = [
  new SlashCommandBuilder().setName('absences').setDescription("🌙 Tableau des absents : qui, retour prévu, raison"),
];

function _fmt(d) {
  try { return new Date(d).toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long' }); } catch { return '—'; }
}
function _jours(d) {
  try { return Math.ceil((new Date(d) - Date.now()) / 86400000); } catch { return null; }
}

async function routeInteraction(interaction) {
  try {
    if (!interaction.isChatInputCommand?.() || interaction.commandName !== 'absences') return false;
    await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
    const db = loadDB();
    const membres = Object.entries(db.members || {});

    const absents = membres
      .filter(([, m]) => m && m.status === 'absent')
      .map(([id, m]) => ({ id, jusqu: m.absentJusqu || null, raison: (m.absentRaison || '').trim(), rang: (m.rang || '').trim() }))
      .sort((a, b) => {
        if (!a.jusqu && !b.jusqu) return 0;
        if (!a.jusqu) return 1;
        if (!b.jusqu) return -1;
        return new Date(a.jusqu) - new Date(b.jusqu);
      });

    const programmees = membres
      .filter(([, m]) => m && m.absenceProgrammee && m.status !== 'absent')
      .map(([id, m]) => ({ id, debut: m.absenceProgrammee.debut, fin: m.absenceProgrammee.fin, raison: (m.absenceProgrammee.raison || '').trim() }))
      .sort((a, b) => new Date(a.debut) - new Date(b.debut));

    const e = new EmbedBuilder().setColor(0xE0A93B).setTitle("🌙 Tableau des absences").setTimestamp()
      .setFooter({ text: "Iron Wolf Company • retour automatique à la date prévue" });

    if (!absents.length && !programmees.length) {
      e.setDescription("✅ **Personne n'est absent.** Toute la troupe est sur le pont.");
    } else {
      e.setDescription("*État des troupes — qui manque à l'appel et quand il revient.*");
      if (absents.length) {
        const lignes = absents.map(a => {
          let quand;
          if (a.jusqu) {
            const j = _jours(a.jusqu);
            const suffixe = j == null ? "" : j <= 0 ? " *(aujourd'hui)*" : j === 1 ? " *(demain)*" : ` *(dans ${j} j)*`;
            quand = `retour **${_fmt(a.jusqu)}**${suffixe}`;
          } else {
            quand = "retour **indéterminé**";
          }
          const r = a.raison ? `\n   ↳ *${a.raison.slice(0, 140)}*` : "";
          return `🟡 <@${a.id}>${a.rang ? ` · ${a.rang}` : ""} — ${quand}${r}`;
        });
        let val = lignes.join("\n");
        if (val.length > 1024) val = val.slice(0, 1000) + "\n…";
        e.addFields({ name: `🟡 Absents actuellement (${absents.length})`, value: val, inline: false });
      }
      if (programmees.length) {
        const lignes = programmees.map(p => `📅 <@${p.id}> — du **${_fmt(p.debut)}** au **${_fmt(p.fin)}**${p.raison ? `\n   ↳ *${p.raison.slice(0, 140)}*` : ""}`);
        let val = lignes.join("\n");
        if (val.length > 1024) val = val.slice(0, 1000) + "\n…";
        e.addFields({ name: `📅 Absences à venir (${programmees.length})`, value: val, inline: false });
      }
    }

    await interaction.editReply({ embeds: [e], allowedMentions: { parse: [] } }).catch(() => {});
    return true;
  } catch (err) {
    if ([10062, 10008, 40060].includes(err?.code)) return true;
    console.log("❌ absences:", err.message);
    try { await interaction.editReply({ content: "⚠️ Erreur lors de l'affichage des absences." }).catch(() => {}); } catch {}
    return true;
  }
}

module.exports = { absencesCommands, routeInteraction };
