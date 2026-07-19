-- ═══════════════════════════════════════════════════════════════
--  ARMURERIE — Numéro de facture (« ticket ») commun aux lignes d'un
--  même règlement à la caisse. Permet de regrouper les articles d'un
--  achat en UNE facture. Additif & idempotent.
--  À exécuter UNE FOIS dans Supabase → SQL Editor.
-- ═══════════════════════════════════════════════════════════════
ALTER TABLE IF EXISTS "ArmurerieVente" ADD COLUMN IF NOT EXISTS "ticket" TEXT;
