-- ═══════════════════════════════════════════════════════════════
--  RECRUTEMENT — candidatures pour rejoindre la Iron Wolf Company.
--  Déposées depuis la page publique /rejoindre. À exécuter UNE FOIS
--  dans Supabase → SQL Editor. Additif & idempotent. Table NEUVE
--  (site-native, jamais réconciliée par le bot).
--
--  Lot Recrutement v2 : ajoute « ref » (n° de dossier public, pour la
--  page de suivi /candidature/<ref>) et « source » (« comment nous as-tu
--  connus ? »). Les deux ALTER couvrent les bases déjà créées.
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS "Candidature" (
  "id"              TEXT PRIMARY KEY,
  "ref"             TEXT,                       -- n° de dossier public (page de suivi)
  "nomRP"           TEXT,
  "age"             TEXT,
  "moyen"           TEXT,                       -- Discord / Télégramme / Autre
  "contact"         TEXT,
  "experience"      TEXT,
  "motivation"      TEXT,
  "disponibilites"  TEXT,
  "source"          TEXT,                       -- « comment nous as-tu connus ? »
  "statut"          TEXT DEFAULT 'nouveau',     -- nouveau / entretien / accepte / refuse
  "notes"           TEXT,                       -- notes internes de l'équipe
  "notifieDiscord"  BOOLEAN DEFAULT false,      -- relayé sur Discord par le bot
  "createdAt"       TIMESTAMPTZ DEFAULT now(),
  "updatedAt"       TIMESTAMPTZ DEFAULT now()
);

-- Montée de version douce (bases déjà créées avant le Lot v2) :
ALTER TABLE "Candidature" ADD COLUMN IF NOT EXISTS "ref"    TEXT;
ALTER TABLE "Candidature" ADD COLUMN IF NOT EXISTS "source" TEXT;

-- Un n° de dossier est unique (quand il existe) → recherche fiable côté suivi.
CREATE UNIQUE INDEX IF NOT EXISTS "Candidature_ref_key" ON "Candidature" ("ref") WHERE "ref" IS NOT NULL;

ALTER TABLE "Candidature" ENABLE ROW LEVEL SECURITY;
