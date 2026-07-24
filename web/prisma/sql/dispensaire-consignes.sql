-- ═══════════════════════════════════════════════════════════════
--  DISPENSAIRE — Consignes du jour (objectifs quotidiens).
--  Une consigne par journée + journal des modifications. Additif &
--  idempotent. À exécuter dans le Supabase du DISPENSAIRE.
-- ═══════════════════════════════════════════════════════════════

-- Consigne du jour (clé = date Paris, ex. 2026-07-24).
CREATE TABLE IF NOT EXISTS "DispensaireConsigne" (
  "jour"       TEXT PRIMARY KEY,
  "texte"      TEXT NOT NULL DEFAULT '',
  "createdBy"  TEXT,
  "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedBy"  TEXT,
  "updatedAt"  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE "DispensaireConsigne" ENABLE ROW LEVEL SECURITY;

-- Journal des modifications (historique : qui a écrit quoi, quand).
CREATE TABLE IF NOT EXISTS "DispensaireConsigneLog" (
  "id"    TEXT PRIMARY KEY,
  "jour"  TEXT NOT NULL,
  "texte" TEXT,
  "par"   TEXT,
  "at"    TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE "DispensaireConsigneLog" ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS "DispensaireConsigneLog_jour_idx" ON "DispensaireConsigneLog" ("jour", "at" DESC);
