// ───────────────────────────────────────────────────────────────────────────
//  diagnostic.js — État de santé du bot (Direction)
//  /diagnostic → vérifie la config (clés), les salons configurés et les données.
// ───────────────────────────────────────────────────────────────────────────
const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');

let dbMod = {};
try { dbMod = require('./db'); } catch { dbMod = {}; }
const loadDB = dbMod.loadDB || (() => ({}));

const DIRECTION_ROLES = ['Concepteur', 'Fléau', 'fleau', 'Fondateur', 'Directeur', 'Conseil', 'Officier'];
function estDirection(member) {
  try { return !!member?.roles?.cache?.some(r => DIRECTION_ROLES.some(n => r.name.includes(n))); } catch { return false; }
}
function oui(b) { return b ? "✅" : "❌"; }
function _count(x) { if (Array.isArray(x)) return x.length; if (x && typeof x === 'object') return Object.keys(x).length; return 0; }
function _invTotal(db) {
  try { const s = db.inventaire?.stock; if (!s) return 0; let t = 0; for (const c of Object.keys(s)) for (const q of Object.values(s[c] || {})) t += (q || 0); return t; } catch { return 0; }
}

const diagnosticCommands = [
  new SlashCommandBuilder().setName("diagnostic").setDescription("🩺 État de santé du bot : config, salons, données (Direction)"),
];

async function routeInteraction(interaction) {
  try {
    if (!interaction.isChatInputCommand?.() || interaction.commandName !== "diagnostic") return false;
    if (!estDirection(interaction.member)) { await interaction.reply({ content: "🔒 Réservé à la Direction.", flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
    const db = loadDB();
    const env = process.env;

    const e = new EmbedBuilder().setColor(0x4A7C59).setTitle("🩺 Diagnostic du bot IWC")
      .setDescription("État de santé actuel — une croix rouge = quelque chose à régler.");

    e.addFields({
      name: "🔑 Configuration (serveur Render)",
      value:
        `${oui(!!env.ANTHROPIC_API_KEY)} Clé IA — résumés, contrats, lecture photo\n` +
        `${oui(!!env.NOTION_TOKEN)} Notion — archivage\n` +
        `${oui(!!(env.GITHUB_TOKEN && env.GITHUB_GIST_ID))} Sauvegarde des données (GitHub Gist)`,
      inline: false,
    });

    const rumOk = !!db.rumeursChannelId;
    const invOk = !!(db.inventaire && db.inventaire.channelId);
    e.addFields({
      name: "📍 Salons configurés",
      value:
        `${oui(rumOk)} Rumeurs automatiques${rumOk ? "" : " — lance /rumeurs-salon"}\n` +
        `${oui(invOk)} Coffre / inventaire${invOk ? "" : " — lance /inventaire-installer"}`,
      inline: false,
    });

    e.addFields({
      name: "📊 Données",
      value:
        `👥 Membres : **${_count(db.members)}**\n` +
        `📜 Contrats : **${_count(db.contrats)}**\n` +
        `🎯 Opérations : **${_count(db.operations)}**\n` +
        `📋 Candidatures : **${_count(db.candidatures)}**\n` +
        `📅 RDV clients : **${_count(db.rdvClients)}**\n` +
        `🤝 Articles en coffre : **${_invTotal(db)}**`,
      inline: false,
    });

    const cof = db.coffres || {};
    if (typeof cof.legal === 'number' || typeof cof.illegal === 'number') {
      e.addFields({ name: "💰 Trésorerie", value: `Légal : **${cof.legal ?? 0}** · Illégal : **${cof.illegal ?? 0}**`, inline: false });
    }

    e.setFooter({ text: "Iron Wolf Company • diagnostic" });
    await interaction.editReply({ embeds: [e] }).catch(() => {});
    return true;
  } catch (err) {
    if ([10062, 10008, 40060].includes(err?.code)) return true;
    console.log("❌ diagnostic:", err.message);
    try { await interaction.editReply({ content: "⚠️ Erreur pendant le diagnostic." }).catch(() => {}); } catch {}
    return true;
  }
}

module.exports = { diagnosticCommands, routeInteraction };
