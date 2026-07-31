-- ═══════════════════════════════════════════════════════════════════════════
--  DISPENSAIRE — Unification des « Matières premières » dans le Stock.
--  Les matières ne sont plus une table à part : ce sont des articles de
--  DispensaireStock avec categorie = 'matiere'. On ajoute le champ fournisseur
--  au stock mutualisé (matières ET matériel médical), puis on retire l'ancienne
--  table dédiée. Les données seront ressaisies manuellement.
--  À exécuter UNE FOIS dans Supabase. Idempotent.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1) Champ fournisseur sur le stock mutualisé.
ALTER TABLE "DispensaireStock" ADD COLUMN IF NOT EXISTS "fournisseur" TEXT;

-- 2) Retrait de la table matières dédiée (remplacée par la catégorie 'matiere').
DROP TABLE IF EXISTS "DispensaireMatiere";
