-- ═══════════════════════════════════════════════════════════════
--  RAPPORTS DE TERRAIN — historique des captures « Son du jeu » / « Ma voix ».
--  À exécuter UNE FOIS dans Supabase → SQL Editor. Additif & idempotent.
--  Le bot y enregistre chaque scène transcrite (texte + résumé) ; le site
--  les affiche sur la page Notes vocales. Table NEUVE, jamais réconciliée.
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS "RapportTerrain" (
  "id"        TEXT PRIMARY KEY,
  "agent"     TEXT,
  "cible"     TEXT,
  "lieu"      TEXT,
  "priorite"  TEXT DEFAULT 'normale',
  "texte"     TEXT,                        -- transcription intégrale
  "resume"    TEXT,                        -- résumé structuré (IA)
  "source"    TEXT DEFAULT 'jeu',          -- 'jeu' (son du jeu) / 'micro' (ma voix)
  "createdAt" TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE "RapportTerrain" ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS "RapportTerrain_createdAt_idx" ON "RapportTerrain" ("createdAt" DESC);
