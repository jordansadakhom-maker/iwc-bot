-- ═══════════════════════════════════════════════════════════════
--  HISTORIQUE DES ACCÈS — Dispensaire de Saint-Denis
--  Journalise l'ouverture des modules SENSIBLES (espace Direction) :
--  qui, quand, combien de temps. À lancer UNE fois. Additif & idempotent.
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS "DispensaireAcces" (
  "id"          TEXT PRIMARY KEY,
  "identifiant" TEXT,                          -- ID Discord si disponible
  "nom"         TEXT,
  "role"        TEXT,                          -- grade au moment de l'accès
  "module"      TEXT,                          -- route du module (ex. /dispensaire/cockpit)
  "moduleLabel" TEXT,
  "ouvertAt"    TIMESTAMPTZ DEFAULT now(),
  "dureeSec"    INTEGER                        -- rempli à la fermeture (temps passé)
);
CREATE INDEX IF NOT EXISTS "DispensaireAcces_ouvert_idx" ON "DispensaireAcces" ("ouvertAt" DESC);
CREATE INDEX IF NOT EXISTS "DispensaireAcces_module_idx" ON "DispensaireAcces" ("module");
ALTER TABLE "DispensaireAcces" ENABLE ROW LEVEL SECURITY;
