-- ═══════════════════════════════════════════════════════════════
--  ARMURERIE — Photo de l'acquéreur sur une vente (registre officiel).
--  Permet de joindre, à l'encaissement, une photo de la personne à qui
--  l'arme est vendue. Additif & idempotent.
--  À exécuter UNE FOIS dans Supabase → SQL Editor.
-- ═══════════════════════════════════════════════════════════════
ALTER TABLE IF EXISTS "ArmurerieVente" ADD COLUMN IF NOT EXISTS "photo" TEXT;
