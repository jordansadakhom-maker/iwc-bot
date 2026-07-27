-- ═══════════════════════════════════════════════════════════════════════════
--  MESSAGERIE — temps réel (navigateur) : réplication + RLS lecture
--  Additif & idempotent. À exécuter dans le Supabase PRINCIPAL (IWC).
--  Prérequis : conversations.sql (tables Conversation / Message).
--
--  Même schéma que les notifications : le site lit via service_role (bypass RLS),
--  on ouvre seulement la lecture aux membres CONNECTÉS pour que l'abonnement
--  temps réel du navigateur reçoive les nouveaux messages d'un fil ouvert et les
--  mises à jour de la liste des conversations. Tolérant si déjà en place.
--
--  ROLLBACK :
--    DROP POLICY IF EXISTS "Message_select_auth" ON "Message";
--    DROP POLICY IF EXISTS "Conversation_select_auth" ON "Conversation";
--    ALTER PUBLICATION supabase_realtime DROP TABLE "Message";
--    ALTER PUBLICATION supabase_realtime DROP TABLE "Conversation";
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
