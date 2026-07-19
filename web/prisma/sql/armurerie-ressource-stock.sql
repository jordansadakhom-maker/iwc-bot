-- ═══════════════════════════════════════════════════════════════
--  ARMURERIE — STOCK des ressources (matières premières).
--  Permet le cycle : acheter des ressources (+stock) → fabriquer un
--  produit (−ressources, +produit fini). Additif & idempotent.
--  À exécuter UNE FOIS dans Supabase → SQL Editor.
-- ═══════════════════════════════════════════════════════════════
ALTER TABLE IF EXISTS "ArmurerieRessource" ADD COLUMN IF NOT EXISTS "stock" INTEGER DEFAULT 0;
