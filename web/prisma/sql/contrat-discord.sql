-- ═══════════════════════════════════════════════════════════════
--  CONTRATS — Champs identiques au formulaire Discord : type de mission,
--  niveau de risque (Confrérie) et échéance. La colonne « motif » (consignes
--  / détails) existe déjà. Additif & idempotent, repli automatique côté synchro
--  si ces colonnes manquent (le contrat n'est jamais perdu).
--  À exécuter UNE FOIS dans Supabase → SQL Editor.
-- ═══════════════════════════════════════════════════════════════
ALTER TABLE IF EXISTS "Contrat" ADD COLUMN IF NOT EXISTS "categorie" text;
ALTER TABLE IF EXISTS "Contrat" ADD COLUMN IF NOT EXISTS "risque" text;
ALTER TABLE IF EXISTS "Contrat" ADD COLUMN IF NOT EXISTS "echeance" text;
