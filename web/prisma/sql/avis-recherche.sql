-- ═══════════════════════════════════════════════════════════════
--  Champs « affiche WANTED » pour les avis de recherche (table Traque).
--  À exécuter UNE FOIS dans Supabase → SQL Editor (fenêtre privée).
--  Idempotent (IF NOT EXISTS). Les avis s'affichent déjà sans, ces colonnes
--  ajoutent la photo, la position, mort/vif, le commanditaire et le signalement.
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE "Traque" ADD COLUMN IF NOT EXISTS "photo"         TEXT;
ALTER TABLE "Traque" ADD COLUMN IF NOT EXISTS "position"      TEXT;
ALTER TABLE "Traque" ADD COLUMN IF NOT EXISTS "vivantMort"    TEXT;
ALTER TABLE "Traque" ADD COLUMN IF NOT EXISTS "commanditaire" TEXT;
ALTER TABLE "Traque" ADD COLUMN IF NOT EXISTS "signalement"   TEXT;
ALTER TABLE "Traque" ADD COLUMN IF NOT EXISTS "chasseurs"     INTEGER;
