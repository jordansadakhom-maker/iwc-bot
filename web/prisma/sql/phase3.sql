-- ═══════════════════════════════════════════════════════════════
--  PHASE 3 — Finances : portefeuilles perso + journal de trésorerie.
--  À exécuter UNE FOIS dans Supabase → SQL Editor (fenêtre privée).
--  Additif & idempotent.
-- ═══════════════════════════════════════════════════════════════

-- Portefeuilles RP par membre (db.economie)
CREATE TABLE IF NOT EXISTS "Portefeuille" (
  "id"         TEXT PRIMARY KEY,
  "solde"      INTEGER DEFAULT 0,
  "historique" JSONB DEFAULT '[]'::jsonb,
  "updatedAt"  TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE "Portefeuille" ENABLE ROW LEVEL SECURITY;

-- Journal de trésorerie du coffre (db.tresorerieLedger)
CREATE TABLE IF NOT EXISTS "Transaction" (
  "id"        TEXT PRIMARY KEY,
  "sens"      TEXT,
  "montant"   INTEGER DEFAULT 0,
  "poste"     TEXT,
  "motif"     TEXT,
  "auteur"    TEXT,
  "createdAt" TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE "Transaction" ENABLE ROW LEVEL SECURITY;
