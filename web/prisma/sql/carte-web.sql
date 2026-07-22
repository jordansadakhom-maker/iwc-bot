-- ═══════════════════════════════════════════════════════════════
--  CARTE — lieux & itinéraires ajoutés DEPUIS LE SITE (web-native).
--  Tables séparées de CartePoint/CarteRoute (qui, elles, sont réconciliées
--  par le bot depuis le salon Discord « carte » : y écrire ferait effacer
--  nos ajouts). getCarte() FUSIONNE les deux sources à l'affichage.
--  À exécuter UNE FOIS. 100 % additif & idempotent.
-- ═══════════════════════════════════════════════════════════════

-- Lieux ajoutés depuis le site (x/y en % de la carte, 0–100).
CREATE TABLE IF NOT EXISTS "CartePointWeb" (
  "id"        TEXT PRIMARY KEY,
  "type"      TEXT NOT NULL DEFAULT 'autre',
  "niveau"    TEXT NOT NULL DEFAULT 'public',   -- 'public' | 'membre' | 'confidentiel'
  "nom"       TEXT NOT NULL,
  "region"    TEXT,
  "lieu"      TEXT,
  "notes"     TEXT,
  "x"         DOUBLE PRECISION,
  "y"         DOUBLE PRECISION,
  "par"       TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE "CartePointWeb" ENABLE ROW LEVEL SECURITY;

-- Itinéraires ajoutés depuis le site (polyligne de points {x,y} en %).
CREATE TABLE IF NOT EXISTS "CarteRouteWeb" (
  "id"        TEXT PRIMARY KEY,
  "type"      TEXT NOT NULL DEFAULT 'autre',
  "niveau"    TEXT NOT NULL DEFAULT 'public',
  "nom"       TEXT NOT NULL,
  "notes"     TEXT,
  "points"    JSONB NOT NULL DEFAULT '[]'::jsonb,
  "par"       TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE "CarteRouteWeb" ENABLE ROW LEVEL SECURITY;

-- Réglages de la carte (ex. image de fond). Clé/valeur simple.
CREATE TABLE IF NOT EXISTS "CarteConfig" (
  "cle"       TEXT PRIMARY KEY,
  "valeur"    TEXT,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE "CarteConfig" ENABLE ROW LEVEL SECURITY;
