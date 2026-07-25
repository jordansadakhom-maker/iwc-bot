-- ═══════════════════════════════════════════════════════════════
--  DISPENSAIRE — Factures : statuts MULTIPLES (cases à cocher).
--  Additif & idempotent. À exécuter dans le Supabase du DISPENSAIRE.
--
--  Une facture peut désormais porter PLUSIEURS statuts à la fois
--  (« Non payée » + « Relancée » + « Transmise », ou « Payée » +
--  « Clôturé »…). Ils sont stockés en CSV dans la colonne `statuts`.
--  L'ancienne colonne `statut` (unique) est CONSERVÉE et tenue à jour
--  avec le statut « représentatif » — rien de ce qui la lit ne casse
--  (rapport police, filtres, stats). Compat ascendante totale.
-- ═══════════════════════════════════════════════════════════════

-- Ensemble des statuts, en CSV : ex. « non_payee,relancee,transmise ».
ALTER TABLE "DispensaireFacture" ADD COLUMN IF NOT EXISTS "statuts" TEXT;

-- Reprise des lignes existantes : on initialise `statuts` à partir du
-- `statut` unique déjà présent (repli « non_payee » si vide). Idempotent :
-- ne touche que les lignes dont `statuts` n'est pas encore renseigné.
UPDATE "DispensaireFacture"
   SET "statuts" = COALESCE(NULLIF(TRIM("statut"), ''), 'non_payee')
 WHERE "statuts" IS NULL OR TRIM("statuts") = '';
