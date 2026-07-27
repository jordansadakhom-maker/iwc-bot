-- ═══════════════════════════════════════════════════════════════════════════
--  INTERVENTIONS / CRO DU DISPENSAIRE (Lot 5) — à exécuter dans le Supabase du
--  DISPENSAIRE (projet séparé zcoqmc…). Additif & idempotent.
--
--  « DispensaireIntervention » = une opération avec son compte-rendu opératoire
--  (CRO) : patient, chirurgien, assistants, salle, horaires, gestes réalisés,
--  complications, statut (planifiée → en cours → terminée / annulée).
--
--  Immutabilité applicative : RLS activée SANS policy → navigateur bloqué, seules
--  les écritures service_role (server actions) passent.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS "DispensaireIntervention" (
  "id"               TEXT PRIMARY KEY,
  "patient"          TEXT NOT NULL,
  "patientNormalise" TEXT NOT NULL,
  "type"             TEXT,
  "chirurgien"       TEXT,
  "assistants"       TEXT,
  "salle"            TEXT,
  "statut"           TEXT NOT NULL DEFAULT 'planifiee',  -- planifiee | en_cours | terminee | annulee
  "debut"            TIMESTAMPTZ,
  "fin"              TIMESTAMPTZ,
  "soinsRealises"    TEXT,
  "complications"    TEXT,
  "compteRendu"      TEXT,
  "note"             TEXT,
  "createdAt"        TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"        TIMESTAMPTZ,
  "updatedBy"        TEXT
);

CREATE INDEX IF NOT EXISTS "DispInterv_statut_idx"  ON "DispensaireIntervention"("statut", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "DispInterv_patient_idx" ON "DispensaireIntervention"("patientNormalise");

ALTER TABLE "DispensaireIntervention" ENABLE ROW LEVEL SECURITY;
