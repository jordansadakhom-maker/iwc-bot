// ───────────────────────────────────────────────────────────────────────────
//  diagnostic.js — État de santé du bot (Direction)
//  /diagnostic → vérifie la config (clés), les salons configurés et les données.
// ───────────────────────────────────────────────────────────────────────────
const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');

let dbMod = {};
try { dbMod = require('./db'); } catch { dbMod = {}; }
const loadDB = dbMod.loadDB || (() => ({}));
const backupGit = (typeof dbMod.sauvegarderSurGitHub === 'function') ? dbMod.sauvegarderSurGitHub : null;

const DIRECTION_ROLES = ['Concepteur', 'Fléau', 'fleau', 'Fondateur', 'Directeur', 'Conseil', 'Officier'];
function estDirection(member) {
  try { return !!member?.roles?.cache?.some(r => DIRECTION_ROLES.some(n => r.name.includes(n))); } catch { return false; }
}
function oui(b) { return b ? "✅" : "❌"; }
function _count(x) { if (Array.isArray(x)) return x.length; if (x && typeof x === 'object') return Object.keys(x).length; return 0; }
function _invTotal(db) {
  try { const s = db.inventaire?.stock; if (!s) return 0; let t = 0; for (const c of Object.keys(s)) for (const q of Object.values(s[c] || {})) t += (q || 0); return t; } catch { return 0; }
}

// Mini-appel réel à l'IA pour vérifier que la clé fonctionne (pas juste présente)
async function _testIA(key) {
  if (!key) return { ok: false, msg: "clé absente" };
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 5, messages: [{ role: 'user', content: 'Réponds: OK' }] }),
    });
    if (r.ok) return { ok: true, msg: "ok" };
    if (r.status === 401) return { ok: false, msg: "clé refusée (401)" };
    return { ok: false, msg: `erreur ${r.status}` };
  } catch { return { ok: false, msg: "injoignable" }; }
}

// Lit le Gist et renvoie la date du dernier instantané backup-AAAA-MM-JJ
async function _dernierBackup(token, gistId) {
  if (!token || !gistId) return null;
  try {
    const r = await fetch(`https://api.github.com/gists/${gistId}`, {
      headers: { 'Authorization': `Bearer ${token}`, 'User-Agent': 'iwc-bot', 'Accept': 'application/vnd.github+json' },
    });
    if (!r.ok) return null;
    const data = await r.json();
    const dates = Object.keys(data.files || {})
      .map(n => (n.match(/^backup-(\d{4}-\d{2}-\d{2})\.json$/) || [])[1])
      .filter(Boolean).sort();
    return dates.length ? dates[dates.length - 1] : null;
  } catch { return null; }
}

// Mini-appel réel à Notion pour vérifier que le token fonctionne
async function _testNotion(token) {
  if (!token) return { ok: false, msg: "token absent" };
  try {
    const r = await fetch('https://api.notion.com/v1/users/me', { headers: { 'Authorization': `Bearer ${token}`, 'Notion-Version': '2022-06-28' } });
    if (r.ok) return { ok: true, msg: "ok" };
    if (r.status === 401) return { ok: false, msg: "token refusé (401)" };
    return { ok: false, msg: `erreur ${r.status}` };
  } catch { return { ok: false, msg: "injoignable" }; }
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

    // Tests en direct (en parallèle pour aller vite)
    const gitConfigured = !!(env.GITHUB_TOKEN && env.GITHUB_GIST_ID);
    const [iaTest, notionTest, saveOk, backup] = await Promise.all([
      _testIA(env.ANTHROPIC_API_KEY),
      _testNotion(env.NOTION_TOKEN),
      (gitConfigured && backupGit ? backupGit().catch(() => false) : Promise.resolve(null)),
      (gitConfigured ? _dernierBackup(env.GITHUB_TOKEN, env.GITHUB_GIST_ID) : Promise.resolve(null)),
    ]);

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

    e.addFields({
      name: "🧪 Tests en direct",
      value:
        `${oui(iaTest.ok)} IA joignable${iaTest.ok ? "" : ` — ${iaTest.msg}`}\n` +
        `${oui(notionTest.ok)} Notion joignable${notionTest.ok ? "" : ` — ${notionTest.msg}`}\n` +
        `${saveOk === null ? "➖" : oui(saveOk)} Écriture de la sauvegarde${saveOk === null ? " — non configurée" : saveOk === false ? " — ÉCHEC" : " — testée à l'instant"}\n` +
        `🗄️ Dernier backup : **${backup || "—"}**`,
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
