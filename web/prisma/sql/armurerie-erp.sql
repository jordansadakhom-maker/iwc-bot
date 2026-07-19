-- ═══════════════════════════════════════════════════════════════
--  ARMURERIE DE VAN HORN — module ERP (façon panel de gestion) :
--  employés, pointage, paies, impôts, comptabilité, bloc-notes, tâches.
--  À exécuter UNE FOIS dans Supabase → SQL Editor (fenêtre privée).
--  Additif & idempotent. Tables NEUVES (jamais réconciliées par le bot
--  → écrites directement par le site).
-- ═══════════════════════════════════════════════════════════════

-- Employés de l'armurerie (roster : sert au pointage et aux paies)
CREATE TABLE IF NOT EXISTS "ArmurerieEmploye" (
  "id"          TEXT PRIMARY KEY,
  "nom"         TEXT NOT NULL,
  "discordId"   TEXT,
  "role"        TEXT DEFAULT 'Armurier',      -- Patron / Armurier / Apprenti…
  "commission"  INTEGER DEFAULT 0,            -- % du CA reversé en paie
  "salaireBase" INTEGER DEFAULT 0,            -- fixe par période
  "actif"       BOOLEAN DEFAULT true,
  "createdAt"   TIMESTAMPTZ DEFAULT now(),
  "updatedAt"   TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE "ArmurerieEmploye" ENABLE ROW LEVEL SECURITY;

-- Pointage (prise/fin de service — suivi des heures travaillées)
CREATE TABLE IF NOT EXISTS "ArmureriePointage" (
  "id"         TEXT PRIMARY KEY,
  "employeId"  TEXT,
  "employeNom" TEXT,
  "debut"      TIMESTAMPTZ,
  "fin"        TIMESTAMPTZ,
  "minutes"    INTEGER DEFAULT 0,
  "createdAt"  TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE "ArmureriePointage" ENABLE ROW LEVEL SECURITY;

-- Paies (fiche de paie par employé — commission sur CA + fixe + prime)
CREATE TABLE IF NOT EXISTS "ArmureriePaie" (
  "id"         TEXT PRIMARY KEY,
  "employeId"  TEXT,
  "employeNom" TEXT,
  "periode"    TEXT,                          -- libellé de la période
  "ventes"     INTEGER DEFAULT 0,             -- CA rattaché à l'employé
  "commission" INTEGER DEFAULT 0,             -- montant issu de la commission
  "base"       INTEGER DEFAULT 0,             -- salaire fixe
  "prime"      INTEGER DEFAULT 0,
  "montant"    INTEGER DEFAULT 0,             -- total versé
  "statut"     TEXT DEFAULT 'du',             -- du / paye
  "notes"      TEXT,
  "payeAt"     TIMESTAMPTZ,
  "createdAt"  TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE "ArmureriePaie" ENABLE ROW LEVEL SECURITY;

-- Impôts (cycles fiscaux : CA de la période × taux → montant à régler)
CREATE TABLE IF NOT EXISTS "ArmurerieImpot" (
  "id"              TEXT PRIMARY KEY,
  "libelle"         TEXT,
  "debut"           TEXT,
  "fin"             TEXT,
  "chiffreAffaires" INTEGER DEFAULT 0,
  "taux"            INTEGER DEFAULT 0,         -- %
  "montant"         INTEGER DEFAULT 0,
  "statut"          TEXT DEFAULT 'du',         -- du / paye
  "payeAt"          TIMESTAMPTZ,
  "notes"           TEXT,
  "createdAt"       TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE "ArmurerieImpot" ENABLE ROW LEVEL SECURITY;

-- Bloc-notes partagé (mémos épinglables)
CREATE TABLE IF NOT EXISTS "ArmurerieNote" (
  "id"        TEXT PRIMARY KEY,
  "titre"     TEXT,
  "contenu"   TEXT,
  "epingle"   BOOLEAN DEFAULT false,
  "auteur"    TEXT,
  "createdAt" TIMESTAMPTZ DEFAULT now(),
  "updatedAt" TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE "ArmurerieNote" ENABLE ROW LEVEL SECURITY;

-- Tâches (check-list de l'atelier)
CREATE TABLE IF NOT EXISTS "ArmurerieTache" (
  "id"        TEXT PRIMARY KEY,
  "texte"     TEXT NOT NULL,
  "fait"      BOOLEAN DEFAULT false,
  "assigneA"  TEXT,
  "auteur"    TEXT,
  "createdAt" TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE "ArmurerieTache" ENABLE ROW LEVEL SECURITY;
