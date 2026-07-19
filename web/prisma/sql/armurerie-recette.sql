-- ═══════════════════════════════════════════════════════════════
--  ARMURERIE — RECETTES DE CRAFT sur les produits (ingrédients requis).
--  À exécuter UNE FOIS dans Supabase → SQL Editor. Additif & idempotent.
-- ═══════════════════════════════════════════════════════════════
ALTER TABLE IF EXISTS "ArmurerieProduit" ADD COLUMN IF NOT EXISTS "recette" JSONB DEFAULT '[]'::jsonb;
