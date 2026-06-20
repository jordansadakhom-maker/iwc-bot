// ───────────────────────────────────────────────────────────────────────────
//  utils.js — Fonctions utilitaires PURES, extraites d'index.js à l'identique.
//  Aucun rôle, aucune permission, aucune synchronisation, aucun ID ici :
//  uniquement du formatage. Comportement strictement inchangé.
// ───────────────────────────────────────────────────────────────────────────

function fmtLong(d) { return !d ? '—' : new Date(d).toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }); }
function fmtShort(d) { return !d ? '—' : new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }); }
function daysSince(d) { return !d ? 999 : Math.floor((Date.now() - new Date(d).getTime()) / 86400000); }
function parisOffsetHours(date) { const tzStr = date.toLocaleString('en-US', { timeZone: 'Europe/Paris' }); const utcStr = date.toLocaleString('en-US', { timeZone: 'UTC' }); return Math.round((new Date(tzStr).getTime() - new Date(utcStr).getTime()) / 3600000); }
function _fmtDollars(n) { return `${Math.round(Number(n) || 0).toLocaleString('fr-FR')} $`; }

module.exports = { fmtLong, fmtShort, daysSince, parisOffsetHours, _fmtDollars };
