-- ═══════════════════════════════════════════════════════════════
--  ARMURERIE — RAPPORTS DU SCAN HORAIRE DE COHÉRENCE DE STOCK.
--  Écrite par le bot (scan-armurerie.js) via la clé service_role.
--  Site-native, jamais réconciliée. À exécuter UNE FOIS. Additif & idempotent.
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS "ArmurerieScanRapport" (
  "id"        TEXT PRIMARY KEY,
  "createdAt" TIMESTAMPTZ DEFAULT now(),
  "anomalies" JSONB DEFAULT '[]'::jsonb,   -- [{type, cible, nom, ...}]
  "resume"    TEXT,                        -- résumé lisible (ex. « 2 négatifs, 1 doublon »)
  "nb"        INTEGER DEFAULT 0            -- nombre total d'anomalies
);
ALTER TABLE "ArmurerieScanRapport" ENABLE ROW LEVEL SECURITY;
-- Rattrapage si la table préexistait sans ces colonnes :
ALTER TABLE IF EXISTS "ArmurerieScanRapport" ADD COLUMN IF NOT EXISTS "anomalies" JSONB DEFAULT '[]'::jsonb;
ALTER TABLE IF EXISTS "ArmurerieScanRapport" ADD COLUMN IF NOT EXISTS "resume"    TEXT;
ALTER TABLE IF EXISTS "ArmurerieScanRapport" ADD COLUMN IF NOT EXISTS "nb"        INTEGER DEFAULT 0;
CREATE INDEX IF NOT EXISTS "ArmurerieScanRapport_createdAt_idx" ON "ArmurerieScanRapport" ("createdAt" DESC);
