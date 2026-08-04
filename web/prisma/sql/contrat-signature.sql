-- Contrats · signature par lien sécurisé (statut d'envoi/signature du commanditaire).
-- Additif, idempotent, sans risque : tant qu'il n'est pas lancé, la synchro replie
-- automatiquement sans la colonne (comme `dossier` sur Operation). À lancer une
-- fois dans Supabase → SQL Editor.

alter table "Contrat" add column if not exists "signature" jsonb;
