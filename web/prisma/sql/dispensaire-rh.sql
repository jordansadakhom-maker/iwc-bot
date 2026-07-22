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
  "statut"          TEXT NOT NULL DEFAULT 'actif',   -- actif | suspendu | renvoye
  "absJustifiees"   INTEGER NOT NULL DEFAULT 0,
  "absInjustifiees" INTEGER NOT NULL DEFAULT 0,
  "notes"           TEXT,
  "createdAt"       TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"       TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedBy"       TEXT
);
ALTER TABLE "DispensaireSalarie" ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS "DispensaireSalarie_nom_idx" ON "DispensaireSalarie" (lower("nom"));
