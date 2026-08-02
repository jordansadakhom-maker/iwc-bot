-- ═══════════════════════════════════════════════════════════════
--  DISPENSAIRE — Ajustements de paie (primes + correction de jours).
--  Additif & idempotent. À exécuter dans le Supabase du DISPENSAIRE.
--
--  La Direction peut, par salarié et par semaine :
--    • saisir une PRIME (ajoutée au salaire calculé) ;
--    • CORRIGER le nombre de jours (ajustement ±) quand un pointage manque.
--  Les changements sont tracés dans le journal d'audit (événements salaire.*).
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS "DispensairePaieAjust" (
  "id"            TEXT PRIMARY KEY,
  "semaineLundi"  TEXT NOT NULL,                         -- lundi de la semaine (YYYY-MM-DD)
  "nomKey"        TEXT NOT NULL,                         -- nom normalisé (clé de rapprochement)
  "nom"           TEXT NOT NULL,                         -- nom affiché
  "prime"         INTEGER NOT NULL DEFAULT 0,            -- prime en $ (≥ 0)
  "ajustJours"    INTEGER NOT NULL DEFAULT 0,            -- correction de jours (peut être négative)
  "updatedAt"     TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedBy"     TEXT,
  UNIQUE ("semaineLundi", "nomKey")
);
ALTER TABLE "DispensairePaieAjust" ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS "idx_disp_paie_ajust_sem" ON "DispensairePaieAjust"("semaineLundi");

-- Archives de paie enrichies : on fige aussi la prime, l'ajustement de jours, les
-- jours détectés (auto) et le salaire de base, pour un instantané exact de la paie.
ALTER TABLE "DispensairePaie" ADD COLUMN IF NOT EXISTS "prime"       INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "DispensairePaie" ADD COLUMN IF NOT EXISTS "ajustJours"  INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "DispensairePaie" ADD COLUMN IF NOT EXISTS "joursAuto"   INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "DispensairePaie" ADD COLUMN IF NOT EXISTS "salaireBase" INTEGER NOT NULL DEFAULT 0;
