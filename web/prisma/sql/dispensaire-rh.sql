-- ═══════════════════════════════════════════════════════════════
--  DISPENSAIRE DE SAINT-DENIS — RH / Salariés (web-native).
--  Roster : grade, date d'embauche, qualifications, coordonnées, absences
--  (justifiées / injustifiées → renvoi auto au seuil), statut.
--  À exécuter UNE FOIS dans Supabase. Additif & idempotent.
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS "DispensaireSalarie" (
  "id"              TEXT PRIMARY KEY,
  "nom"             TEXT NOT NULL,
  "grade"           TEXT,
  "qualifications"  TEXT,
  "dateEmbauche"    DATE,
  "compteBancaire"  TEXT,
  "telegramme"      TEXT,
  "statut"          TEXT NOT NULL DEFAULT 'actif',   -- actif | suspendu | renvoye | demission
  "absJustifiees"   INTEGER NOT NULL DEFAULT 0,
  "absInjustifiees" INTEGER NOT NULL DEFAULT 0,
  "notes"           TEXT,
  "dateDepart"      DATE,                             -- date de départ (renvoi ou démission)
  "motifDepart"     TEXT,                             -- motif du départ (facultatif)
  "createdAt"       TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"       TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedBy"       TEXT
);
ALTER TABLE "DispensaireSalarie" ENABLE ROW LEVEL SECURITY;
-- Colonnes de départ (bases déjà installées) — additif & idempotent.
ALTER TABLE "DispensaireSalarie" ADD COLUMN IF NOT EXISTS "dateDepart"  DATE;
ALTER TABLE "DispensaireSalarie" ADD COLUMN IF NOT EXISTS "motifDepart" TEXT;
CREATE INDEX IF NOT EXISTS "DispensaireSalarie_nom_idx" ON "DispensaireSalarie" (lower("nom"));
