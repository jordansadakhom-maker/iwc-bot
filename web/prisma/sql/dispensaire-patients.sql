-- ═══════════════════════════════════════════════════════════════════════════
--  FONDATION CLINIQUE DU DISPENSAIRE (Lot 2) — identité patient & dossier médical
--  À exécuter dans le Supabase du DISPENSAIRE (projet séparé zcoqmc…).
--  Additif & idempotent — rejouable, ne casse rien.
--
--  « DispensairePatient » = identité patient STABLE + dossier médical structuré
--  (groupe sanguin, allergies, antécédents, traitements, médecin référent…).
--  Une seule fiche par patient, rapprochée par nom normalisé (nomNormalise) —
--  l'existant (factures, ventes, certificats) continue de fonctionner par nom :
--  la fiche vient l'enrichir, elle ne remplace rien.
--
--  Immutabilité applicative : RLS activée SANS policy → navigateur bloqué, seules
--  les écritures service_role (server actions) passent.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS "DispensairePatient" (
  "id"              TEXT PRIMARY KEY,
  "nom"             TEXT NOT NULL,
  "nomNormalise"    TEXT NOT NULL,            -- clé de rapprochement (nom sans accents/casse)
  "dateNaissance"   TEXT,
  "telephone"       TEXT,
  "groupeSanguin"   TEXT,
  "allergies"       TEXT,
  "antecedents"     TEXT,
  "traitements"     TEXT,
  "medecinReferent" TEXT,
  "notes"           TEXT,
  "pieceJointe"     TEXT,                     -- lien image (référence visuelle : blessure, radio…)
  "createdAt"       TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"       TIMESTAMPTZ,
  "updatedBy"       TEXT
);
ALTER TABLE "DispensairePatient" ADD COLUMN IF NOT EXISTS "pieceJointe" TEXT;

-- Une seule fiche par patient (nom normalisé) → le « chercher ou créer » est
-- idempotent et empêche les doublons d'homonymes silencieux.
CREATE UNIQUE INDEX IF NOT EXISTS "DispensairePatient_norm_key" ON "DispensairePatient"("nomNormalise");

ALTER TABLE "DispensairePatient" ENABLE ROW LEVEL SECURITY;
