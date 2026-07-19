-- ═══════════════════════════════════════════════════════════════
--  ARMURERIE — niveau de craft sur les produits. À exécuter UNE FOIS
--  dans Supabase → SQL Editor. Additif & idempotent, sans perte.
-- ═══════════════════════════════════════════════════════════════
ALTER TABLE IF EXISTS "ArmurerieProduit" ADD COLUMN IF NOT EXISTS "niveau" INTEGER DEFAULT 0;
