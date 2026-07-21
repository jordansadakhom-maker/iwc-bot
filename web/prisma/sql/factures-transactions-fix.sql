-- ═══════════════════════════════════════════════════════════════
--  CORRECTIF — colonnes manquantes Facture / Transaction / Candidature.
--  À exécuter UNE FOIS dans Supabase → SQL Editor. Additif & idempotent
--  (ADD COLUMN IF NOT EXISTS : n'écrase rien, relançable sans risque).
--
--  Corrige les avertissements de synchro du bot :
--    ⚠️ Facture: 'numero' column not found
--    ⚠️ Transaction: 'auteur' column not found
--    ⚠️ GET Candidature?notifieDiscord=is.false → HTTP 400
--  Colonnes tirées de supabase-sync.js (mapping factures / transactions).
-- ═══════════════════════════════════════════════════════════════

-- ── Facture : colonnes attendues par la synchro du bot ──
CREATE TABLE IF NOT EXISTS "Facture" ("id" TEXT PRIMARY KEY);
ALTER TABLE "Facture" ADD COLUMN IF NOT EXISTS "numero"       TEXT;
ALTER TABLE "Facture" ADD COLUMN IF NOT EXISTS "objet"        TEXT;
ALTER TABLE "Facture" ADD COLUMN IF NOT EXISTS "montant"      numeric(14,2) DEFAULT 0;
ALTER TABLE "Facture" ADD COLUMN IF NOT EXISTS "clientNom"    TEXT;
ALTER TABLE "Facture" ADD COLUMN IF NOT EXISTS "type"         TEXT;
ALTER TABLE "Facture" ADD COLUMN IF NOT EXISTS "remuneration" TEXT;
ALTER TABLE "Facture" ADD COLUMN IF NOT EXISTS "ref"          TEXT;
ALTER TABLE "Facture" ADD COLUMN IF NOT EXISTS "createdAt"    TIMESTAMPTZ DEFAULT now();
ALTER TABLE "Facture" ENABLE ROW LEVEL SECURITY;

-- ── Transaction : journal de trésorerie ──
CREATE TABLE IF NOT EXISTS "Transaction" ("id" TEXT PRIMARY KEY);
ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "sens"      TEXT;
ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "montant"   numeric(14,2) DEFAULT 0;
ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "poste"     TEXT;
ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "motif"     TEXT;
ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "auteur"    TEXT;
ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ DEFAULT now();
ALTER TABLE "Transaction" ENABLE ROW LEVEL SECURITY;

-- ── Candidature : drapeau « déjà notifié sur Discord » (corrige le HTTP 400) ──
ALTER TABLE "Candidature" ADD COLUMN IF NOT EXISTS "notifieDiscord" BOOLEAN DEFAULT false;
