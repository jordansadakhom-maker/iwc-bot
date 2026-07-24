-- ═══════════════════════════════════════════════════════════════
--  DISPENSAIRE — Factures : paiement tracé + journal des actions.
--  Additif & idempotent. À exécuter dans le Supabase du DISPENSAIRE.
-- ═══════════════════════════════════════════════════════════════

-- Échéance à l'heure près (72 h) : on élargit les dates DATE → TIMESTAMPTZ.
-- (Cast direct : les dates existantes deviennent minuit ; sans risque.)
ALTER TABLE "DispensaireFacture" ALTER COLUMN "dateEmission" TYPE TIMESTAMPTZ USING "dateEmission"::timestamptz;
ALTER TABLE "DispensaireFacture" ALTER COLUMN "dateEcheance" TYPE TIMESTAMPTZ USING "dateEcheance"::timestamptz;

-- Traçabilité du règlement (date + auteur du paiement).
ALTER TABLE "DispensaireFacture" ADD COLUMN IF NOT EXISTS "datePaiement" TIMESTAMPTZ;
ALTER TABLE "DispensaireFacture" ADD COLUMN IF NOT EXISTS "payePar" TEXT;

-- Journal des actions sur une facture (créée, statut, paiement, rapport, copie…).
CREATE TABLE IF NOT EXISTS "DispensaireFactureLog" (
  "id"         TEXT PRIMARY KEY,
  "factureId"  TEXT NOT NULL,
  "action"     TEXT NOT NULL,
  "detail"     TEXT,
  "par"        TEXT,
  "at"         TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE "DispensaireFactureLog" ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS "DispensaireFactureLog_at_idx" ON "DispensaireFactureLog" ("at" DESC);
