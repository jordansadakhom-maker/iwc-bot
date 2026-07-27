-- ═══════════════════════════════════════════════════════════════════════════
--  IWC — BUNDLE ERP « TOUT-EN-UN »  (Phases 4 & 5)
--  À exécuter UNE FOIS dans le Supabase PRINCIPAL (IWC), d'un seul bloc.
--  100 % additif & idempotent : ré-exécutable sans risque, ne casse rien.
--
--  Regroupe, dans le bon ordre :
--    1) event-socle.sql              — journal Event + projection ActivityLog
--    2) taches.sql                   — module Tâches
--    3) conversations.sql            — messagerie interne (Conversation/Message)
--    4) conversations-realtime.sql   — temps réel de la messagerie
--    5) notifications-ciblage-role.sql — ciblage notifs par membre + rôle (RLS)
--
--  Le site fonctionne déjà sans ce bundle (dégradation propre) ; il ACTIVE
--  l'audit complet, les modules Tâches & Messagerie, le temps réel des fils et
--  le ciblage temps réel des notifications. Le bot n'est pas concerné.
-- ═══════════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════════════
--  1) SOCLE ÉVÉNEMENTIEL — journal unique + projection d'audit
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS "Event" (
  "id"           TEXT PRIMARY KEY,
  "aggregate"    TEXT NOT NULL,
  "type"         TEXT NOT NULL,
  "actorId"      TEXT,
  "actorNom"     TEXT,
  "cibleId"      TEXT,
  "cibleLibelle" TEXT,
  "pole"         TEXT,
  "roleCible"    TEXT,
  "membreId"     TEXT,
  "avant"        JSONB,
  "apres"        JSONB,
  "payload"      JSONB,
  "ref"          TEXT,
  "priorite"     INT NOT NULL DEFAULT 0,
  "createdAt"    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "Event_ref_key"     ON "Event"("ref") WHERE "ref" IS NOT NULL;
CREATE INDEX        IF NOT EXISTS "Event_created_idx"  ON "Event"("createdAt" DESC);
CREATE INDEX        IF NOT EXISTS "Event_agg_idx"      ON "Event"("aggregate", "createdAt" DESC);
ALTER TABLE "Event" ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS "ActivityLog" (
  "id"      TEXT PRIMARY KEY,
  "module"  TEXT NOT NULL,
  "action"  TEXT NOT NULL,
  "cible"   TEXT,
  "cibleId" TEXT,
  "avant"   JSONB,
  "apres"   JSONB,
  "par"     TEXT,
  "parId"   TEXT,
  "at"      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "ActivityLog_at_idx"  ON "ActivityLog"("at" DESC);
CREATE INDEX IF NOT EXISTS "ActivityLog_mod_idx" ON "ActivityLog"("module", "at" DESC);
ALTER TABLE "ActivityLog" ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS "EventDeadLetter" (
  "id"       TEXT PRIMARY KEY,
  "contexte" JSONB,
  "erreur"   TEXT,
  "at"       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS "EventCursor" (
  "consumer"    TEXT PRIMARY KEY,
  "lastEventId" TEXT,
  "lastRunAt"   TIMESTAMPTZ
);

CREATE OR REPLACE FUNCTION audit_from_event() RETURNS TRIGGER AS $$
BEGIN
  BEGIN
    INSERT INTO "ActivityLog"("id","module","action","cible","cibleId","avant","apres","par","parId","at")
    VALUES (gen_random_uuid()::text, NEW."aggregate", NEW."type", NEW."cibleLibelle", NEW."cibleId",
            NEW."avant", NEW."apres", NEW."actorNom", NEW."actorId", NEW."createdAt");
  EXCEPTION WHEN OTHERS THEN
    BEGIN
      INSERT INTO "EventDeadLetter"("id","contexte","erreur","at")
      VALUES (gen_random_uuid()::text, to_jsonb(NEW), SQLERRM, now());
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_audit_from_event" ON "Event";
CREATE TRIGGER "trg_audit_from_event" AFTER INSERT ON "Event"
  FOR EACH ROW EXECUTE FUNCTION audit_from_event();


-- ═══════════════════════════════════════════════════════════════════════════
--  2) TÂCHES — module unifié (site-native)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS "Tache" (
  "id"         TEXT PRIMARY KEY,
  "titre"      TEXT NOT NULL,
  "detail"     TEXT,
  "assigneId"  TEXT,
  "assigneNom" TEXT,
  "pole"       TEXT,
  "priorite"   TEXT NOT NULL DEFAULT 'normale',
  "echeance"   TIMESTAMPTZ,
  "statut"     TEXT NOT NULL DEFAULT 'a_faire',
  "source"     TEXT DEFAULT 'manuel',
  "creePar"    TEXT,
  "creeParId"  TEXT,
  "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"  TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedBy"  TEXT
);
CREATE INDEX IF NOT EXISTS "Tache_statut_idx"   ON "Tache"("statut", "priorite");
CREATE INDEX IF NOT EXISTS "Tache_assigne_idx"  ON "Tache"("assigneId", "statut");
CREATE INDEX IF NOT EXISTS "Tache_echeance_idx" ON "Tache"("echeance") WHERE "echeance" IS NOT NULL;
ALTER TABLE "Tache" ENABLE ROW LEVEL SECURITY;


-- ═══════════════════════════════════════════════════════════════════════════
--  3) CONVERSATIONS — messagerie interne (site-native)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS "Conversation" (
  "id"            TEXT PRIMARY KEY,
  "sujet"         TEXT NOT NULL,
  "pole"          TEXT,
  "statut"        TEXT NOT NULL DEFAULT 'ouverte',
  "creePar"       TEXT,
  "creeParId"     TEXT,
  "lastMessageAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "lastApercu"    TEXT,
  "lastAuteur"    TEXT,
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "Conversation_tri_idx" ON "Conversation"("statut", "lastMessageAt" DESC);
ALTER TABLE "Conversation" ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS "Message" (
  "id"             TEXT PRIMARY KEY,
  "conversationId" TEXT NOT NULL,
  "auteurId"       TEXT,
  "auteurNom"      TEXT,
  "corps"          TEXT NOT NULL,
  "createdAt"      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "Message_conv_idx" ON "Message"("conversationId", "createdAt");
ALTER TABLE "Message" ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS "ConversationVue" (
  "conversationId" TEXT NOT NULL,
  "membreId"       TEXT NOT NULL,
  "vuAt"           TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY ("conversationId", "membreId")
);
ALTER TABLE "ConversationVue" ENABLE ROW LEVEL SECURITY;


-- ═══════════════════════════════════════════════════════════════════════════
--  4) MESSAGERIE — temps réel (RLS lecture + publication supabase_realtime)
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE "Message" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Message_select_auth" ON "Message";
CREATE POLICY "Message_select_auth" ON "Message" FOR SELECT TO authenticated USING (true);

ALTER TABLE "Conversation" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Conversation_select_auth" ON "Conversation";
CREATE POLICY "Conversation_select_auth" ON "Conversation" FOR SELECT TO authenticated USING (true);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'Message'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE "Message";
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'Conversation'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE "Conversation";
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;


-- ═══════════════════════════════════════════════════════════════════════════
--  5) NOTIFICATIONS — ciblage par membre + rôle (RLS temps réel navigateur)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.current_discord_id() RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    auth.jwt() -> 'user_metadata' ->> 'provider_id',
    auth.jwt() -> 'user_metadata' ->> 'sub'
  );
$$;

CREATE OR REPLACE FUNCTION public.current_member_has_role(role text) RETURNS boolean
LANGUAGE plpgsql STABLE AS $$
DECLARE
  did text := public.current_discord_id();
  g text;
  fiche jsonb;
BEGIN
  IF did IS NULL THEN RETURN false; END IF;
  SELECT lower(coalesce("grade", '')), "ficheRH" INTO g, fiche FROM "Membre" WHERE "id" = did;
  IF NOT FOUND THEN RETURN false; END IF;
  RETURN CASE lower(coalesce(role, ''))
    WHEN 'direction' THEN g ~ 'fondateur|conseil|directeur|fl[eé]au|concepteur'
    WHEN 'officier'  THEN g ~ 'fondateur|conseil|directeur|fl[eé]au|concepteur|officier|instructeur'
    WHEN 'medecin'   THEN coalesce(nullif(fiche ->> 'medecin', '')::boolean, false)
    WHEN 'armurier'  THEN g ~ 'fondateur|conseil|directeur|fl[eé]au|concepteur|armur'
    ELSE false
  END;
EXCEPTION WHEN OTHERS THEN RETURN false;
END; $$;

ALTER TABLE "Notification" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Notification_select_auth"  ON "Notification";
DROP POLICY IF EXISTS "Notification_select_cible" ON "Notification";
CREATE POLICY "Notification_select_cible" ON "Notification" FOR SELECT TO authenticated
USING (
  ("membreId" IS NULL AND "roleCible" IS NULL)
  OR "membreId" = public.current_discord_id()
  OR ("roleCible" IS NOT NULL AND public.current_member_has_role("roleCible"))
);

-- ═══════════════════════════════════════════════════════════════════════════
--  FIN DU BUNDLE. Tout est en place. 🐺
-- ═══════════════════════════════════════════════════════════════════════════
