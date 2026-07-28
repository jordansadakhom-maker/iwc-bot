-- ═══════════════════════════════════════════════════════════════════════════
--  RECHERCHE UNIVERSELLE — index trigram (ILIKE %terme%) · OPTIONNEL (perf)
--  ⚠️  À exécuter dans le Supabase PRINCIPAL de l'IWC (SQL Editor).
--  100 % additif · idempotent. Sans lui, la recherche fonctionne (ILIKE full-scan)
--  mais se dégrade avec le volume ; avec lui, chaque frappe reste instantanée.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "Membre_nomIC_trgm"          ON "Membre"          USING gin ("nomIC" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Operation_cible_trgm"       ON "Operation"       USING gin ("cible" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "ArmurerieClient_nom_trgm"   ON "ArmurerieClient" USING gin ("nom" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "ArmurerieContrat_cli_trgm"  ON "ArmurerieContrat" USING gin ("clientNom" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Arme_serie_trgm"            ON "Arme"            USING gin ("serie" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Demande_titre_trgm"         ON "Demande"         USING gin ("titre" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Licence_nom_trgm"           ON "Licence"         USING gin ("nom" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Licence_numero_trgm"        ON "Licence"         USING gin ("numero" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Rdv_nomRP_trgm"             ON "Rdv"             USING gin ("nomRP" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "TelegrammeWeb_nom_trgm"     ON "TelegrammeWeb"   USING gin ("nom" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Facture_clientNom_trgm"     ON "Facture"         USING gin ("clientNom" gin_trgm_ops);
