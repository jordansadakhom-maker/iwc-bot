-- ═══════════════════════════════════════════════════════════════
--  DISPENSAIRE — Planification de la génération du rapport d'impayés.
--  Une seule ligne (id = 'config'). Lue par le Cron Vercel.
--  Additif & idempotent. À exécuter dans le Supabase du DISPENSAIRE.
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS "DispensaireRapportConfig" (
  "id"         TEXT PRIMARY KEY,             -- toujours 'config'
  "mode"       TEXT NOT NULL DEFAULT 'manuel', -- manuel | quotidien | hebdo | mensuel
  "heure"      INTEGER NOT NULL DEFAULT 8,    -- heure de génération (0-23, Paris)
  "jour"       INTEGER NOT NULL DEFAULT 1,    -- hebdo: 1=lundi..7=dimanche ; mensuel: jour du mois
  "lastAutoAt" TIMESTAMPTZ,                   -- dernière génération automatique
  "updatedAt"  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE "DispensaireRapportConfig" ENABLE ROW LEVEL SECURITY;
