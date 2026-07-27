-- ═══════════════════════════════════════════════════════════════════════════
--  CHAMBRES / LITS DU DISPENSAIRE (Lot 5) — à exécuter dans le Supabase du
--  DISPENSAIRE (projet séparé zcoqmc…). Additif & idempotent.
--
--  « DispensaireChambre » = un lit / une chambre avec son état (libre, occupée,
--  réservée, en nettoyage), son occupant éventuel et le médecin en charge.
--
--  Immutabilité applicative : RLS activée SANS policy → navigateur bloqué, seules
--  les écritures service_role (server actions) passent.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS "DispensaireChambre" (
  "id"               TEXT PRIMARY KEY,
  "nom"              TEXT NOT NULL,
  "type"             TEXT,
  "etat"             TEXT NOT NULL DEFAULT 'libre',   -- libre | occupee | reservee | nettoyage
  "patient"          TEXT,
  "patientNormalise" TEXT,
  "medecin"          TEXT,
  "depuis"           TIMESTAMPTZ,
  "note"             TEXT,
  "createdAt"        TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"        TIMESTAMPTZ,
  "updatedBy"        TEXT
);

CREATE INDEX IF NOT EXISTS "DispChambre_etat_idx" ON "DispensaireChambre"("etat");

ALTER TABLE "DispensaireChambre" ENABLE ROW LEVEL SECURITY;
