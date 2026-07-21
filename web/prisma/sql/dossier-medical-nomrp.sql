-- ═══════════════════════════════════════════════════════════════
--  MÉDICAL — nom du patient porté par le dossier (« nomRP »).
--  Permet d'afficher le bon nom pour les dossiers importés du salon et les
--  patients NON-membres (le nom ne dépend plus d'une jointure sur Membre).
--  À exécuter UNE FOIS dans Supabase → SQL Editor. Additif & idempotent.
--  Sûr sans : getMedical retombe sur le nom du membre si la colonne manque.
-- ═══════════════════════════════════════════════════════════════
ALTER TABLE IF EXISTS "DossierMedical" ADD COLUMN IF NOT EXISTS "nomRP" text;
