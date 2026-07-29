-- ═══════════════════════════════════════════════════════════════
-- Villes & Marchés de chasse — prix de rachat par ville, catégories
-- Légal / Illégal, comparateur & historique. Tables SITE-NATIVES (le bot n'y
-- touche jamais → aucun conflit de synchro). 100 % additif et idempotent.
-- À lancer dans Supabase → SQL Editor.
-- ═══════════════════════════════════════════════════════════════

create table if not exists "ChasseVille" (
  id text primary key,
  nom text not null,
  actif boolean not null default true,
  ordre int not null default 0,
  "createdAt" timestamptz not null default now()
);

-- Catalogue des ressources rachetables, avec leur catégorie (data-driven :
-- on en ajoute autant qu'on veut depuis le site, sans toucher au code).
create table if not exists "ChasseRessourceMarche" (
  id text primary key,
  nom text not null unique,
  categorie text not null default 'legal',   -- 'legal' | 'illegal'
  ordre int not null default 0,
  "createdAt" timestamptz not null default now()
);

-- Un prix de rachat par (ville, ressource).
create table if not exists "ChasseMarchePrix" (
  id text primary key,
  "villeId" text not null,
  ressource text not null,
  prix numeric not null default 0,
  "updatedAt" timestamptz not null default now(),
  unique ("villeId", ressource)
);

-- Journal des changements de prix (qui, avant → après, quand).
create table if not exists "ChasseMarcheHistorique" (
  id text primary key,
  "villeId" text,
  ville text,
  ressource text,
  ancien numeric,
  nouveau numeric,
  par text,
  "createdAt" timestamptz not null default now()
);

-- Ressources par défaut (exemples de départ — modifiables/supprimables ensuite).
insert into "ChasseRessourceMarche" (id, nom, categorie, ordre) values
  ('rmk-viandegibier',     'Viande de gibier',       'legal',   10),
  ('rmk-viandegrosgibier', 'Viande de gros gibier',  'legal',   11),
  ('rmk-viandepetitgibier','Viande de petit gibier', 'legal',   12),
  ('rmk-viandevolaille',   'Viande de volaille',     'legal',   13),
  ('rmk-poisson',          'Poisson',                'legal',   14),
  ('rmk-peaux',            'Peaux',                  'legal',   20),
  ('rmk-plumes',           'Plumes',                 'legal',   21),
  ('rmk-bois',             'Bois',                   'legal',   22),
  ('rmk-peauours',         'Peau d''ours',           'illegal', 50),
  ('rmk-crocsloup',        'Crocs de loup',          'illegal', 51),
  ('rmk-carapacetortue',   'Carapace de tortue',     'illegal', 52)
on conflict (nom) do nothing;
