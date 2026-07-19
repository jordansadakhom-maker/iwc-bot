-- ═══════════════════════════════════════════════════════════════
--  ARMURERIE — RESSOURCES (matières premières nécessaires au craft).
--  À exécuter UNE FOIS dans Supabase → SQL Editor. Additif & idempotent.
--  Table NEUVE (site-native, jamais réconciliée par le bot).
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS "ArmurerieRessource" (
  "id"        TEXT PRIMARY KEY,
  "nom"       TEXT NOT NULL,
  "categorie" TEXT DEFAULT 'Divers',
  "prix"      numeric(14,2) DEFAULT 0,   -- coût unitaire de la ressource
  "mine"      BOOLEAN DEFAULT false,     -- vient de la mine → remise 5 % applicable
  "createdAt" TIMESTAMPTZ DEFAULT now(),
  "updatedAt" TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE "ArmurerieRessource" ENABLE ROW LEVEL SECURITY;
-- Sécurité si la table existait déjà sans ces colonnes :
ALTER TABLE IF EXISTS "ArmurerieRessource" ADD COLUMN IF NOT EXISTS "categorie" TEXT DEFAULT 'Divers';
ALTER TABLE IF EXISTS "ArmurerieRessource" ADD COLUMN IF NOT EXISTS "mine" BOOLEAN DEFAULT false;
