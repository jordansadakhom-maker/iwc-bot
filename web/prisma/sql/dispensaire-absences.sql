-- ═══════════════════════════════════════════════════════════════
--  DISPENSAIRE — Absences datées (justifiées / injustifiées).
--  Additif & idempotent. À exécuter dans le Supabase du DISPENSAIRE.
--
--  Complète le pointage : une absence est DATÉE et qualifiée
--  (justifiée ou non). Sert la vue d'assiduité sur 3 semaines et le
--  suivi direction. (Les compteurs cumulés absJustifiees/absInjustifiees
--  de DispensaireSalarie restent intacts — compat totale.)
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS "DispensaireAbsence" (
  "id"         TEXT PRIMARY KEY,
  "salarieId"  TEXT,                                   -- réf. souple DispensaireSalarie.id
  "nom"        TEXT NOT NULL,                          -- nom dénormalisé
  "date"       DATE NOT NULL,                          -- jour de l'absence
  "justifiee"  BOOLEAN NOT NULL DEFAULT false,
  "motif"      TEXT,
  "par"        TEXT,
  "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_disp_absence_date" ON "DispensaireAbsence"("date");
CREATE INDEX IF NOT EXISTS "idx_disp_absence_nom" ON "DispensaireAbsence"("nom");
