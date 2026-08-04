-- Opérations · dossier de mission « 1904 » (blob JSON rédigé sur le site).
-- Additif, idempotent, sans risque : tant qu'il n'est pas lancé, la synchro replie
-- automatiquement sans la colonne (comme pour `contrat`). À lancer une fois dans
-- Supabase → SQL Editor.

ALTER TABLE IF EXISTS "Operation" ADD COLUMN IF NOT EXISTS "dossier" jsonb;
