-- ═══════════════════════════════════════════════════════════════
--  POINTAGE HYBRIDE — Dispensaire de Saint-Denis
--  Enrichit DispensairePointage pour la détection intelligente des oublis :
--  heartbeat (lastSeen), état, origine de clôture, validation & correction.
--  À lancer UNE fois dans Supabase → SQL Editor. Additif & idempotent.
--  Le pointage actuel continue de fonctionner avant comme après.
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE "DispensairePointage" ADD COLUMN IF NOT EXISTS "etat"        TEXT;        -- en_service / a_confirmer / cloture
ALTER TABLE "DispensairePointage" ADD COLUMN IF NOT EXISTS "lastSeen"    TIMESTAMPTZ; -- dernier signal du navigateur (heartbeat)
ALTER TABLE "DispensairePointage" ADD COLUMN IF NOT EXISTS "finSource"   TEXT;        -- normal / oubli / user / direction
ALTER TABLE "DispensairePointage" ADD COLUMN IF NOT EXISTS "valide"      BOOLEAN;     -- compte pour la paie
ALTER TABLE "DispensairePointage" ADD COLUMN IF NOT EXISTS "commentaire" TEXT;        -- note de correction (Direction/salarié)
ALTER TABLE "DispensairePointage" ADD COLUMN IF NOT EXISTS "corrigePar"  TEXT;        -- auteur de la correction

-- Reprise de l'existant (aucune perte) : les services DÉJÀ clôturés sont des
-- services normaux et validés ; les services ouverts restent « en service ».
UPDATE "DispensairePointage" SET "valide" = true                       WHERE "fin" IS NOT NULL AND "valide"    IS NULL;
UPDATE "DispensairePointage" SET "finSource" = 'normal'                WHERE "fin" IS NOT NULL AND "finSource" IS NULL;
UPDATE "DispensairePointage" SET "etat" = 'cloture'                    WHERE "fin" IS NOT NULL AND "etat"      IS NULL;
UPDATE "DispensairePointage" SET "etat" = 'en_service'                 WHERE "fin" IS NULL     AND "etat"      IS NULL;

-- Les seuils (inactivité en minutes, escalade en heures) sont gérés depuis
-- l'Administration → table DispensaireConfig (clés pointageInactiviteMin /
-- pointageEscaladeH). Valeurs par défaut appliquées automatiquement si absentes
-- (10 min / 24 h) — aucune ligne à insérer ici.
