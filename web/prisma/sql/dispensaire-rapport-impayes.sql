-- ═══════════════════════════════════════════════════════════════
--  DISPENSAIRE — Rapports d'impayés aux forces de l'ordre (historique).
--  Chaque génération enregistre un instantané (snapshot) : ce qui permet
--  de consulter les anciens rapports et de « remettre à zéro » la liste des
--  paiements récents (fenêtre = depuis le dernier rapport).
--  Additif & idempotent. À exécuter dans le Supabase du DISPENSAIRE.
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS "DispensaireRapportImpayes" (
  "id"           TEXT PRIMARY KEY,
  "at"           TIMESTAMPTZ NOT NULL DEFAULT now(),
  "par"          TEXT,
  "depuis"       TIMESTAMPTZ,          -- borne : rapport précédent (fenêtre des paiements)
  "nbImpayes"    INTEGER NOT NULL DEFAULT 0,
  "nbPaiements"  INTEGER NOT NULL DEFAULT 0,
  "snapshot"     JSONB                 -- rapport complet figé (pour l'aperçu / réimpression)
);
ALTER TABLE "DispensaireRapportImpayes" ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS "DispensaireRapportImpayes_at_idx" ON "DispensaireRapportImpayes" ("at" DESC);
