// ─────────────────────────────────────────────────────────────────────────────
//  automations.js — Tâches automatiques planifiées (cron)
//  • relancerInactifs : MP de relance aux visiteurs qui ont rejoint mais n'ont
//    fait aucune démarche (pas de télégramme/RDV) après quelques jours.
//  • rappelerOpsBloquees : ping les assignés quand une opération stagne.
// ─────────────────────────────────────────────────────────────────────────────
const { loadDB, saveDB, sauvegarderSurGitHub } = require('./db');
let accueil = {}; try { accueil = require('./accueil'); } catch {}

const JOURS_RELANCE = 3;        // relancer après 3 jours sans démarche
const MAX_RELANCES = 2;         // au plus 2 relances par personne
const MAX_RELANCES_PAR_RUN = 10; // éviter une rafale de MP d'un coup
const JOURS_OP_BLOQUEE = 3;     // opération sans activité depuis 3 jours = bloquée

const _jours = (ms) => ms / 86400000;

// ── Relance des visiteurs inactifs ──
async function relancerInactifs(client) {
  try {
    const guild = client.guilds.cache.first(); if (!guild) return;
    const db = loadDB(); const now = Date.now();
    const clients = db.rdvplus?.clients || {};
    let envoyees = 0;
    for (const [id, m] of Object.entries(db.members || {})) {
      if (envoyees >= MAX_RELANCES_PAR_RUN) break;
      if (!m || m.status !== 'visiteur') continue;          // seulement les visiteurs
      if (clients[id]) continue;                            // a déjà pris contact → on laisse
      const joined = m.joinedAt ? Date.parse(m.joinedAt) : 0;
      if (!joined || _jours(now - joined) < JOURS_RELANCE) continue;
      if ((m.relances || 0) >= MAX_RELANCES) continue;
      if (m.derniereRelance && _jours(now - Date.parse(m.derniereRelance)) < JOURS_RELANCE) continue;
      const membre = await guild.members.fetch(id).catch(() => null);
      if (!membre) continue;
      if (!membre.roles.cache.some(r => r.name.includes('Visiteur'))) continue; // promu entre-temps
      const ok = await accueil.envoyerAccueil?.(membre, { relance: true });
      m.relances = (m.relances || 0) + 1; m.derniereRelance = new Date().toISOString();
      if (ok === false) m.relanceEchec = true;
      if (ok) envoyees++;
    }
    if (envoyees) { saveDB(db); sauvegarderSurGitHub?.().catch(() => {}); console.log(`🔁 Relance inactifs : ${envoyees} MP envoyé(s).`); }
    else saveDB(db);
  } catch (e) { console.log('⚠️ relancerInactifs:', e.message); }
}

// ── Rappel des opérations bloquées ──
async function rappelerOpsBloquees(client) {
  try {
    const guild = client.guilds.cache.first(); if (!guild) return;
    const db = loadDB(); const now = Date.now();
    const ops = [...(db.preparations || []), ...(db.operations || [])];
    let rappels = 0;
    for (const op of ops) {
      const st = String(op.status || '').toLowerCase();
      if (['termine', 'terminee', 'cloture', 'cloturee', 'annule', 'annulee'].includes(st)) continue;
      // dernière activité = max(création, dernière étape validée)
      let last = Date.parse(op.createdAt || '') || 0;
      for (const e of (op.etapes || [])) { if (e?.valideeAt) { const t = Date.parse(e.valideeAt); if (t > last) last = t; } }
      if (!last || _jours(now - last) < JOURS_OP_BLOQUEE) continue;                 // a bougé récemment
      if (op.lastRelanceBloquee && _jours(now - Date.parse(op.lastRelanceBloquee)) < JOURS_OP_BLOQUEE) continue; // déjà relancé récemment
      const chId = op.threadId || op.channelId; if (!chId) continue;
      const ch = await guild.channels.fetch(chId).catch(() => null); if (!ch?.send) continue;
      const assignes = [...new Set([...(op.membres || []), ...(op.agents || [])])];
      const ping = assignes.map(i => `<@${i}>`).join(' ');
      const jours = Math.floor(_jours(now - last));
      await ch.send({
        content: `${ping ? ping + '\n' : ''}⏰ **Opération en attente depuis ${jours} jour(s).**\nPensez à faire avancer l'étape en cours ou à clôturer l'opération.`,
        allowedMentions: { users: assignes.slice(0, 50) },
      }).catch(() => {});
      op.lastRelanceBloquee = new Date().toISOString();
      rappels++;
    }
    if (rappels) { saveDB(db); sauvegarderSurGitHub?.().catch(() => {}); console.log(`⏰ Rappels d'opérations bloquées : ${rappels}.`); }
  } catch (e) { console.log('⚠️ rappelerOpsBloquees:', e.message); }
}

module.exports = { relancerInactifs, rappelerOpsBloquees };
