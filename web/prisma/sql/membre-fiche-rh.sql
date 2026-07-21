-- ═══════════════════════════════════════════════════════════════
--  MEMBRES — Fiche RH éditable depuis le SITE (spécialité, statut interne,
--  salaire, notes). Champ SITE-NATIVE : le bot ne l'écrit jamais (il ne
--  l'envoie pas dans sa synchro), donc il n'est jamais écrasé.
--  À exécuter UNE FOIS dans Supabase → SQL Editor. Additif & idempotent.
-- ═══════════════════════════════════════════════════════════════
ALTER TABLE IF EXISTS "Membre" ADD COLUMN IF NOT EXISTS "ficheRH" jsonb DEFAULT '{}'::jsonb;
