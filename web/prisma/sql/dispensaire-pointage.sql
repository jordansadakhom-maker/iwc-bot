-- ═══════════════════════════════════════════════════════════════
--  DISPENSAIRE DE SAINT-DENIS — Pointage (prise de service, web-native).
--  Chaque prise de service = une ligne : début, fin (NULL tant que le
--  salarié est en service), durée en minutes calculée à la clôture.
--  Sert aux « heures & jours travaillés (lun→dim) » et à l'encart
--  « Salariés en service » de l'accueil.
--  À exécuter UNE FOIS dans Supabase. Additif & idempotent.
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS "DispensairePointage" (
  "id"         TEXT PRIMARY KEY,
  "salarieId"  TEXT,                                   -- réf. DispensaireSalarie.id (souple : peut être NULL)
  "nom"        TEXT NOT NULL,                          -- nom dénormalisé pour l'affichage
  "debut"      TIMESTAMPTZ NOT NULL DEFAULT now(),
  "fin"        TIMESTAMPTZ,                            -- NULL = encore en service
  "dureeMin"   INTEGER,                                -- minutes, calculé à la clôture
  "note"       TEXT,
  "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"  TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedBy"  TEXT
);
ALTER TABLE "DispensairePointage" ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS "DispensairePointage_debut_idx" ON "DispensairePointage" ("debut" DESC);
CREATE INDEX IF NOT EXISTS "DispensairePointage_ouvert_idx" ON "DispensairePointage" ("salarieId") WHERE "fin" IS NULL;
