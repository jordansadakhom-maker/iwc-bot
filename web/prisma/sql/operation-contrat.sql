-- ═══════════════════════════════════════════════════════════════
--  OPÉRATIONS — feuille de contrat sur l'opération (statut de signature).
--  Permet d'afficher sur le site l'état du contrat d'opération (envoyé /
--  signé / refusé), renseigné par le bot. À exécuter UNE FOIS dans Supabase.
--  Additif & idempotent. Sûr sans : repli automatique de la synchro.
-- ═══════════════════════════════════════════════════════════════
ALTER TABLE IF EXISTS "Operation" ADD COLUMN IF NOT EXISTS "contrat" jsonb;
