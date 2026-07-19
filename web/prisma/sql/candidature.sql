-- ═══════════════════════════════════════════════════════════════
--  RECRUTEMENT — candidatures pour rejoindre la Iron Wolf Company.
--  Déposées depuis la page publique /rejoindre. À exécuter UNE FOIS
--  dans Supabase → SQL Editor. Additif & idempotent. Table NEUVE
--  (site-native, jamais réconciliée par le bot).
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS "Candidature" (
  "id"              TEXT PRIMARY KEY,
  "nomRP"           TEXT,
  "age"             TEXT,
  "moyen"           TEXT,                       -- Discord / Télégramme / Autre
  "contact"         TEXT,
  "experience"      TEXT,
  "motivation"      TEXT,
  "disponibilites"  TEXT,
  "statut"          TEXT DEFAULT 'nouveau',     -- nouveau / entretien / accepte / refuse
  "notes"           TEXT,                       -- notes internes de l'équipe
  "notifieDiscord"  BOOLEAN DEFAULT false,      -- relayé sur Discord par le bot
  "createdAt"       TIMESTAMPTZ DEFAULT now(),
  "updatedAt"       TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE "Candidature" ENABLE ROW LEVEL SECURITY;
