-- ═══════════════════════════════════════════════════════════════
--  Champs détaillés pour les dossiers médicaux (voir le détail sur le site :
--  notes du médecin, convalescence, test d'aptitude, prochain RDV).
--  À exécuter UNE FOIS dans Supabase → SQL Editor (fenêtre privée pour éviter
--  la traduction Chrome). Idempotent (IF NOT EXISTS).
--  Les blessures / soins / ordonnances / historique sont déjà synchronisés.
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE "DossierMedical" ADD COLUMN IF NOT EXISTS "notes"        TEXT;
ALTER TABLE "DossierMedical" ADD COLUMN IF NOT EXISTS "testValide"   BOOLEAN;
ALTER TABLE "DossierMedical" ADD COLUMN IF NOT EXISTS "prochainRdv"  TEXT;
ALTER TABLE "DossierMedical" ADD COLUMN IF NOT EXISTS "reposJusquAt" TIMESTAMPTZ;
ALTER TABLE "DossierMedical" ADD COLUMN IF NOT EXISTS "reposMotif"   TEXT;
ALTER TABLE "DossierMedical" ADD COLUMN IF NOT EXISTS "majPar"       TEXT;
