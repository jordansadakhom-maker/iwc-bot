-- ═══════════════════════════════════════════════════════════════
--  Champs détaillés pour les fiches contact (voir le détail sur le site).
--  À exécuter UNE FOIS dans Supabase → SQL Editor (fenêtre privée pour éviter
--  la traduction Chrome). Idempotent (IF NOT EXISTS).
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "telegramme"  TEXT;
ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "metier"      TEXT;
ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "affiliation" TEXT;
ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "relation"    TEXT;
ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "statutRP"    TEXT;
ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "creeParNom"  TEXT;
