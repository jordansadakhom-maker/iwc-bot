-- ═══════════════════════════════════════════════════════════════
--  DISPENSAIRE — Rapport d'impayés : délai de retard configurable.
--  Additif & idempotent. À exécuter dans le Supabase du DISPENSAIRE.
--
--  La Direction fixe le nombre de jours (après l'émission) au-delà
--  duquel une facture est « en retard » et devient déclarable aux
--  forces de l'ordre. Défaut : 3 jours.
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE "DispensaireRapportConfig" ADD COLUMN IF NOT EXISTS "joursRetard" INTEGER NOT NULL DEFAULT 3;
