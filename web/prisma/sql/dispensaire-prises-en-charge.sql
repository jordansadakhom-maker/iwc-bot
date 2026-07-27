-- ═══════════════════════════════════════════════════════════════════════════
--  WORKFLOW MÉDICAL DU DISPENSAIRE (Lot 3.1) — la prise en charge
--  À exécuter dans le Supabase du DISPENSAIRE (projet séparé zcoqmc…).
--  Additif & idempotent — rejouable, ne casse rien.
--
--  « DispensairePriseEnCharge » = un épisode de soin, piloté comme une machine à
--  états : admis → en_soin → terminé (ou annulé). Chaque transition est horodatée
--  et journalisée (socle d'événements). Le lien facture (factureId) sera renseigné
--  au Lot 3.2 (couplage soin → stock → facture).
--
--  Immutabilité applicative : RLS activée SANS policy → navigateur bloqué, seules
--  les écritures service_role (server actions) passent.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS "DispensairePriseEnCharge" (
  "id"                TEXT PRIMARY KEY,
  "patient"           TEXT NOT NULL,
  "patientNormalise"  TEXT NOT NULL,            -- rapprochement avec la fiche patient
  "motif"             TEXT,
  "medecin"           TEXT,                     -- médecin assigné (nom)
  "etat"              TEXT NOT NULL DEFAULT 'admis',  -- admis | en_soin | termine | annule
  "note"              TEXT,
  "factureId"         TEXT,                     -- renseigné au Lot 3.2
  "admisAt"           TIMESTAMPTZ NOT NULL DEFAULT now(),
  "soinAt"            TIMESTAMPTZ,
  "finAt"             TIMESTAMPTZ,
  "createdAt"         TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"         TIMESTAMPTZ,
  "updatedBy"         TEXT
);

-- Le tableau de bord liste les épisodes EN COURS (admis/en_soin) triés par arrivée,
-- et le dossier patient croise par nom normalisé.
CREATE INDEX IF NOT EXISTS "DispPEC_etat_idx"    ON "DispensairePriseEnCharge"("etat", "admisAt" DESC);
CREATE INDEX IF NOT EXISTS "DispPEC_patient_idx" ON "DispensairePriseEnCharge"("patientNormalise");

ALTER TABLE "DispensairePriseEnCharge" ENABLE ROW LEVEL SECURITY;
