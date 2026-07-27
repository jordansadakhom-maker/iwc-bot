-- ═══════════════════════════════════════════════════════════════════════════
--  RENDEZ-VOUS / PLANNING DU DISPENSAIRE (Lot 5) — à exécuter dans le Supabase
--  du DISPENSAIRE (projet séparé zcoqmc…). Additif & idempotent.
--
--  « DispensaireRendezVous » = un rendez-vous planifié (patient, type, médecin,
--  salle, priorité, horaire) avec un état de cycle de vie (prévu → honoré /
--  absent / annulé). Rattaché au patient par nom normalisé.
--
--  Immutabilité applicative : RLS activée SANS policy → navigateur bloqué, seules
--  les écritures service_role (server actions) passent.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS "DispensaireRendezVous" (
  "id"               TEXT PRIMARY KEY,
  "patient"          TEXT NOT NULL,
  "patientNormalise" TEXT NOT NULL,
  "type"             TEXT,
  "medecin"          TEXT,
  "salle"            TEXT,
  "priorite"         TEXT NOT NULL DEFAULT 'normale',   -- basse | normale | haute | urgente
  "debut"            TIMESTAMPTZ NOT NULL,
  "dureeMin"         INT,
  "etat"             TEXT NOT NULL DEFAULT 'prevu',      -- prevu | honore | absent | annule
  "motif"            TEXT,
  "note"             TEXT,
  "createdAt"        TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"        TIMESTAMPTZ,
  "updatedBy"        TEXT
);

CREATE INDEX IF NOT EXISTS "DispRDV_debut_idx"   ON "DispensaireRendezVous"("debut");
CREATE INDEX IF NOT EXISTS "DispRDV_etat_idx"    ON "DispensaireRendezVous"("etat", "debut");
CREATE INDEX IF NOT EXISTS "DispRDV_patient_idx" ON "DispensaireRendezVous"("patientNormalise");

ALTER TABLE "DispensaireRendezVous" ENABLE ROW LEVEL SECURITY;
