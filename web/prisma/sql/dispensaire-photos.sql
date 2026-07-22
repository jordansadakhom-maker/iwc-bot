-- ============================================================
-- Dispensaire de Saint-Denis · Photos (Stockage + Coffres)
-- À exécuter dans l'éditeur SQL du projet Supabase du DISPENSAIRE.
-- 100 % additif : ajoute une colonne « photo » (URL) là où il faut, et
-- prépare le stockage des images. N'altère aucune donnée existante.
-- ============================================================

-- 1) Colonnes photo (URL de l'image dans Supabase Storage)
alter table "DispensaireStock"  add column if not exists "photo" text;
alter table "DispensaireCoffre" add column if not exists "photo" text;

-- 2) Espace de stockage des images (bucket public en lecture).
--    L'envoi passe par la clé service côté serveur (jamais exposée).
insert into storage.buckets (id, name, public)
values ('iwc', 'iwc', true)
on conflict (id) do update set public = true;
