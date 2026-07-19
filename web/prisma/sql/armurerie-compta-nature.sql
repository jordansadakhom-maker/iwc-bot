-- ═══════════════════════════════════════════════════════════════
--  ARMURERIE — COMPTABILITÉ : ventilation des dépenses.
--  « nature » sur chaque mouvement de coffre : 'produit' (achat qui
--  entre en stock : armes, matières, ressources) ou 'charge' (frais :
--  paies, impôts, réparations…). Nul pour les recettes.
--  À exécuter UNE FOIS dans Supabase → SQL Editor. Additif & idempotent.
-- ═══════════════════════════════════════════════════════════════
ALTER TABLE IF EXISTS "ArmurerieMouvementCoffre" ADD COLUMN IF NOT EXISTS "nature" TEXT;
