-- ═══════════════════════════════════════════════════════════════════════════
--  DISPENSAIRE — Membres : identité RP + serveur
--  À exécuter dans le Supabase du DISPENSAIRE (projet séparé).
--  100 % additif & idempotent : ajoute 3 colonnes optionnelles à la fiche membre
--  (nom RP, prénom RP, serveur). Rien d'existant n'est modifié.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE "DispensaireMembre" ADD COLUMN IF NOT EXISTS "nomRp"    TEXT;
ALTER TABLE "DispensaireMembre" ADD COLUMN IF NOT EXISTS "prenomRp" TEXT;
ALTER TABLE "DispensaireMembre" ADD COLUMN IF NOT EXISTS "serveur"  TEXT;
