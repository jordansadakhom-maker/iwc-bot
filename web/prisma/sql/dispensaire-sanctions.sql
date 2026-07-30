-- ═══════════════════════════════════════════════════════════════
--  SANCTIONS RH — Dispensaire de Saint-Denis
--  Historique disciplinaire par salarié (blâme, avertissement,
--  suspension, mise à pied, autre). À lancer UNE fois dans Supabase.
--  Additif & idempotent.
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS "DispensaireSanction" (
  "id"          TEXT PRIMARY KEY,
  "salarieId"   TEXT,                         -- fiche salarié concernée
  "nom"         TEXT,                          -- nom au moment de la sanction (trace)
  "type"        TEXT,                          -- blame / avertissement / suspension / mise_a_pied / autre
  "motif"       TEXT,
  "date"        DATE,
  "duree"       TEXT,                          -- ex. « 7 jours » (si applicable)
  "commentaire" TEXT,
  "par"         TEXT,                          -- auteur de la sanction
  "createdAt"   TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "DispensaireSanction_salarie_idx" ON "DispensaireSanction" ("salarieId");
ALTER TABLE "DispensaireSanction" ENABLE ROW LEVEL SECURITY;
