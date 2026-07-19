-- ═══════════════════════════════════════════════════════════════
--  Factures (table Facture). À exécuter UNE FOIS dans Supabase → SQL Editor
--  (fenêtre privée). Idempotent (IF NOT EXISTS).
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS "Facture" (
  "id"           TEXT PRIMARY KEY,
  "numero"       TEXT,
  "objet"        TEXT,
  "montant"      INTEGER DEFAULT 0,
  "clientNom"    TEXT,
  "type"         TEXT,
  "remuneration" TEXT,
  "ref"          TEXT,
  "createdAt"    TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE "Facture" ENABLE ROW LEVEL SECURITY;
