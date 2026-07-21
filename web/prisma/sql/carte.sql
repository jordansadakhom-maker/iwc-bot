-- ═══════════════════════════════════════════════════════════════
--  CARTE — Lieux (points) & itinéraires (routes) de la compagnie, pour la
--  carte interactive du site. Alimenté par la synchro du bot (db.carte).
--  x / y = position en % (0–100) sur le fond de carte, comme sur Discord.
--  niveau : public · membre · confidentiel (filtré selon l'accès sur le site).
--  À exécuter UNE FOIS dans Supabase → SQL Editor. Additif & idempotent.
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS "CartePoint" (
  "id"        text PRIMARY KEY,
  "type"      text,
  "niveau"    text,
  "nom"       text,
  "region"    text,
  "lieu"      text,
  "notes"     text,
  "x"         double precision,
  "y"         double precision,
  "createdAt" timestamptz,
  "updatedAt" timestamptz
);

CREATE TABLE IF NOT EXISTS "CarteRoute" (
  "id"        text PRIMARY KEY,
  "type"      text,
  "niveau"    text,
  "nom"       text,
  "notes"     text,
  "points"    jsonb,
  "createdAt" timestamptz,
  "updatedAt" timestamptz
);

-- Lecture ouverte au rôle service (le site lit côté serveur et filtre l'accès).
ALTER TABLE "CartePoint" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CarteRoute" ENABLE ROW LEVEL SECURITY;
