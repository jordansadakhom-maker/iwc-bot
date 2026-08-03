-- Renseignement · pièce jointe (référence visuelle) sur les rapports d'informateurs.
-- Additif, idempotent, sans risque. Tant qu'il n'est pas lancé, tout continue de
-- fonctionner (la synchro bot et la lecture site replient automatiquement sans la
-- colonne). À lancer une fois dans Supabase → SQL Editor.

ALTER TABLE "RapportInfo" ADD COLUMN IF NOT EXISTS "pieceJointe" TEXT;
