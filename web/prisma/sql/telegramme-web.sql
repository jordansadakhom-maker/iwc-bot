-- ═══════════════════════════════════════════════════════════════
--  Télégrammes ENVOYÉS DEPUIS LE SITE (page publique /telegramme).
--  À exécuter UNE FOIS dans Supabase → SQL Editor. Additif & idempotent.
--  Table NEUVE (jamais réconciliée par le bot).
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS "TelegrammeWeb" (
  "id"        TEXT PRIMARY KEY,
  "nom"       TEXT,
  "contact"   TEXT,
  "message"   TEXT,
  "statut"    TEXT DEFAULT 'nouveau',      -- nouveau / transmis / clos
  "reponses"  JSONB DEFAULT '[]'::jsonb,
  "createdAt" TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE "TelegrammeWeb" ENABLE ROW LEVEL SECURITY;
