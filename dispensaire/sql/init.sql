-- ═══════════════════════════════════════════════════════════════
--  DISPENSAIRE DE SAINT-DENIS — schéma initial (à exécuter UNE FOIS
--  dans Supabase → SQL Editor). Additif & idempotent.
--  Tables préfixées « Disp » pour ne pas toucher aux tables existantes.
-- ═══════════════════════════════════════════════════════════════

-- RH : salariés (onglet protégé)
create table if not exists "DispSalarie" (
  "id" text primary key,
  "nom" text not null,
  "niveau" text,
  "qualifications" text,
  "compteBancaire" text,
  "telegramme" text,
  "actif" boolean default true,
  "createdAt" timestamptz default now()
);

-- Pointage / prise de service (chrono des heures travaillées)
create table if not exists "DispPointage" (
  "id" text primary key,
  "salarieId" text,
  "salarieNom" text not null,
  "debut" timestamptz not null default now(),
  "fin" timestamptz,
  "minutes" integer default 0,
  "createdAt" timestamptz default now()
);

-- Stockage : coffres, matières premières, matériel, nourriture… + seuil d'alerte
create table if not exists "DispStock" (
  "id" text primary key,
  "nom" text not null,
  "categorie" text default 'Matière',      -- Coffre / Matière première / Matériel / Nourriture / Médicament…
  "lieu" text,                               -- quel coffre / emplacement
  "quantite" integer default 0,
  "seuil" integer default 0,                 -- seuil d'alerte
  "unite" text,
  "createdAt" timestamptz default now()
);

-- Traçabilité : chaque +/- sur le stock (qui a pris/ajouté quoi)
create table if not exists "DispMouvement" (
  "id" text primary key,
  "stockId" text,
  "stockNom" text,
  "delta" integer not null,
  "quantiteApres" integer,
  "auteur" text,
  "motif" text,
  "createdAt" timestamptz default now()
);

-- Facturation FDO : shérifs par bureau + prix du soin
create table if not exists "DispSherif" (
  "id" text primary key,
  "bureau" text,
  "nom" text not null,
  "prixSoin" numeric default 0,
  "createdAt" timestamptz default now()
);

-- Répertoire des entreprises (mine, menuiserie…)
create table if not exists "DispRepertoire" (
  "id" text primary key,
  "entreprise" text not null,
  "categorie" text,
  "contact" text,
  "telegramme" text,
  "notes" text,
  "createdAt" timestamptz default now()
);

-- Documents importants
create table if not exists "DispDocument" (
  "id" text primary key,
  "titre" text not null,
  "categorie" text,
  "url" text,
  "notes" text,
  "createdAt" timestamptz default now()
);

-- Ventes de bandages civils (limite 10 / semaine / patient)
create table if not exists "DispVenteBandage" (
  "id" text primary key,
  "patient" text not null,
  "quantite" integer default 1,
  "auteur" text,
  "createdAt" timestamptz default now()
);

-- Factures patients (dont « en retard » — accès chefs)
create table if not exists "DispFacture" (
  "id" text primary key,
  "patient" text not null,
  "montant" numeric default 0,
  "motif" text,
  "echeance" date,
  "paye" boolean default false,
  "payeAt" timestamptz,
  "auteur" text,
  "createdAt" timestamptz default now()
);

-- RLS : activées, lecture publique + écriture via clé service (côté serveur).
alter table "DispSalarie"      enable row level security;
alter table "DispPointage"     enable row level security;
alter table "DispStock"        enable row level security;
alter table "DispMouvement"    enable row level security;
alter table "DispSherif"       enable row level security;
alter table "DispRepertoire"   enable row level security;
alter table "DispDocument"     enable row level security;
alter table "DispVenteBandage" enable row level security;
alter table "DispFacture"      enable row level security;
