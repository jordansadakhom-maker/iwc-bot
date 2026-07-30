-- ═══════════════════════════════════════════════════════════════
--  DISPENSAIRE — Archive des salaires (paie hebdomadaire figée).
--  Additif & idempotent. À exécuter dans le Supabase du DISPENSAIRE.
--
--  Quand la Direction « fige » une semaine, un instantané des salaires
--  calculés est enregistré ici (une ligne par salarié). Sert d'archive
--  de paie et de récapitulatif imprimable.
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS "DispensairePaie" (
  "id"            TEXT PRIMARY KEY,
  "semaineLundi"  TEXT NOT NULL,                        -- lundi de la semaine (YYYY-MM-DD)
  "nom"           TEXT NOT NULL,
  "fonction"      TEXT,
  "montantHebdo"  INTEGER NOT NULL DEFAULT 0,
  "jours"         INTEGER NOT NULL DEFAULT 0,
  "heuresMin"     INTEGER NOT NULL DEFAULT 0,
  "salaire"       INTEGER NOT NULL DEFAULT 0,
  "par"           TEXT,
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_disp_paie_semaine" ON "DispensairePaie"("semaineLundi");
