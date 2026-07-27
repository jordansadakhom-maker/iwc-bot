-- ═══════════════════════════════════════════════════════════════════════════
--  AMBULANCES DU DISPENSAIRE (Lot 5) — à exécuter dans le Supabase du
--  DISPENSAIRE (projet séparé zcoqmc…). Additif & idempotent.
--
--  « DispensaireAmbulance » = un véhicule d'intervention avec son état, son
--  carburant, son kilométrage, son matériel embarqué et son dernier entretien.
--
--  Immutabilité applicative : RLS activée SANS policy → navigateur bloqué, seules
--  les écritures service_role (server actions) passent.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS "DispensaireAmbulance" (
  "id"               TEXT PRIMARY KEY,
  "nom"              TEXT NOT NULL,
  "etat"             TEXT NOT NULL DEFAULT 'disponible',  -- disponible | en_intervention | entretien | hs
  "essence"          INT,
  "kilometrage"      INT,
  "materiel"         TEXT,
  "dernierEntretien" TEXT,
  "note"             TEXT,
  "createdAt"        TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"        TIMESTAMPTZ,
  "updatedBy"        TEXT
);

CREATE INDEX IF NOT EXISTS "DispAmbulance_etat_idx" ON "DispensaireAmbulance"("etat");

ALTER TABLE "DispensaireAmbulance" ENABLE ROW LEVEL SECURITY;
