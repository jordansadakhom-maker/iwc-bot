-- ═══════════════════════════════════════════════════════════════
--  ARMURERIE — Quantité & prix unitaire par ligne de vente.
--  Permet d'afficher « Objet ×N · PU · Total » au lieu du seul total.
--  Additif & idempotent. À exécuter UNE FOIS dans Supabase → SQL Editor.
-- ═══════════════════════════════════════════════════════════════
ALTER TABLE IF EXISTS "ArmurerieVente" ADD COLUMN IF NOT EXISTS "quantite" INTEGER;
ALTER TABLE IF EXISTS "ArmurerieVente" ADD COLUMN IF NOT EXISTS "prixUnitaire" NUMERIC;
