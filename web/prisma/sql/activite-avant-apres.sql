-- ═══════════════════════════════════════════════════════════════════════════
--  JOURNAL D'AUDIT — projeter le « payload » (motif/contexte) dans ActivityLog
--  ⚠️  À exécuter dans le Supabase PRINCIPAL de l'IWC (SQL Editor).
--  100 % additif · idempotent. Requiert event-socle.sql (déjà en place).
--
--  ActivityLog possède déjà « avant » et « apres » (le trigger les copie). Il ne
--  manquait que le contexte/motif, stocké dans Event.payload mais jamais projeté.
--  Ce script ajoute la colonne et met à jour le trigger pour la recopier.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE "ActivityLog" ADD COLUMN IF NOT EXISTS "payload" JSONB;

-- Trigger de projection : identique à event-socle.sql + la colonne payload.
CREATE OR REPLACE FUNCTION audit_from_event() RETURNS TRIGGER AS $$
BEGIN
  BEGIN
    INSERT INTO "ActivityLog"("id","module","action","cible","cibleId","avant","apres","payload","par","parId","at")
    VALUES (gen_random_uuid()::text, NEW."aggregate", NEW."type", NEW."cibleLibelle", NEW."cibleId",
            NEW."avant", NEW."apres", NEW."payload", NEW."actorNom", NEW."actorId", NEW."createdAt");
  EXCEPTION WHEN OTHERS THEN
    BEGIN
      INSERT INTO "EventDeadLetter"("id","contexte","erreur","at")
      VALUES (gen_random_uuid()::text, to_jsonb(NEW), SQLERRM, now());
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

-- Le trigger sur "Event" existe déjà (event-socle.sql) et pointe vers cette
-- fonction : sa redéfinition ci-dessus suffit, rien d'autre à recréer.
