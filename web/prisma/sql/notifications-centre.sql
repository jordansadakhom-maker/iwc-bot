-- ═══════════════════════════════════════════════════════════════════════════
--  CENTRE DE NOTIFICATIONS — événementiel + temps réel (site)
--  Additif & idempotent. À exécuter dans le Supabase PRINCIPAL (IWC).
--
--  Objectif : le site devient la plateforme unique. Chaque événement important
--  (nouveau télégramme, nouveau RDV, changement de statut, clôture, nouvelle
--  réponse) crée UNE ligne dans "Notification" — persistante, dédupliquée,
--  reliée par un lien profond vers la page concernée.
--
--  La table "Notification" existe déjà (init.sql) : id, membreId, roleCible,
--  pole, type, titre, corps, lien, lu, createdAt. On l'ÉTEND sans rien casser.
--
--  Rien ici ne bloque jamais une écriture parente : les triggers avalent toute
--  erreur (EXCEPTION WHEN OTHERS THEN NULL). Tant que ce script n'est pas lancé,
--  le site continue de fonctionner exactement comme avant (aucune régression).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1) Colonnes additionnelles ──────────────────────────────────────────────
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "archive"   BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "luAt"      TIMESTAMPTZ;      -- date/heure de lecture (historique)
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "clientNom" TEXT;            -- nom du client (filtre & affichage)
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "cibleId"   TEXT;            -- id de l'élément visé (deep-link)
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "ref"       TEXT;            -- clé de déduplication (anti-doublons)

-- Anti-doublons : une même ref ne peut exister qu'une fois.
CREATE UNIQUE INDEX IF NOT EXISTS "Notification_ref_key" ON "Notification"("ref") WHERE "ref" IS NOT NULL;
-- Lecture du centre : non archivées, non lues d'abord, récentes en tête.
CREATE INDEX IF NOT EXISTS "Notification_centre_idx" ON "Notification"("archive", "lu", "createdAt" DESC);

-- ── 2) Fonctions de génération (défensives : ne bloquent jamais le parent) ───

-- Télégrammes envoyés depuis le SITE (table TelegrammeWeb).
CREATE OR REPLACE FUNCTION notif_telegramme_web() RETURNS TRIGGER AS $$
BEGIN
  BEGIN
    IF TG_OP = 'INSERT' THEN
      INSERT INTO "Notification"("id","type","titre","corps","lien","clientNom","cibleId","ref","createdAt")
      VALUES (gen_random_uuid()::text, 'telegramme',
              'Nouveau télégramme — ' || COALESCE(NEW."nom", 'Client'),
              LEFT(COALESCE(NEW."message", ''), 180),
              '/communication/telegramme/web-' || NEW."id",
              COALESCE(NEW."nom", 'Client'), 'web-' || NEW."id",
              'tgw-new-' || NEW."id", now())
      ON CONFLICT ("ref") DO NOTHING;
    ELSIF TG_OP = 'UPDATE' AND NEW."statut" IS DISTINCT FROM OLD."statut" AND NEW."statut" = 'clos' THEN
      INSERT INTO "Notification"("id","type","titre","lien","clientNom","cibleId","ref","createdAt")
      VALUES (gen_random_uuid()::text, 'telegramme-clos',
              'Télégramme clôturé — ' || COALESCE(NEW."nom", 'Client'),
              '/communication/telegramme/web-' || NEW."id",
              COALESCE(NEW."nom", 'Client'), 'web-' || NEW."id",
              'tgw-clos-' || NEW."id", now())
      ON CONFLICT ("ref") DO NOTHING;
    END IF;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

-- Télégrammes venant de DISCORD (table Telegramme) : nouvelle conversation,
-- nouvelle réponse (le tableau messages s'allonge), et clôture.
CREATE OR REPLACE FUNCTION notif_telegramme() RETURNS TRIGGER AS $$
DECLARE
  n_old int; n_new int; dernier jsonb; clos_new bool; clos_old bool;
BEGIN
  BEGIN
    IF TG_OP = 'INSERT' THEN
      INSERT INTO "Notification"("id","type","titre","lien","clientNom","cibleId","ref","createdAt")
      VALUES (gen_random_uuid()::text, 'telegramme',
              'Nouveau télégramme — ' || COALESCE(NEW."clientNom", 'Client'),
              '/communication/telegramme/' || NEW."id",
              COALESCE(NEW."clientNom", 'Client'), NEW."id",
              'tg-new-' || NEW."id", now())
      ON CONFLICT ("ref") DO NOTHING;
    ELSIF TG_OP = 'UPDATE' THEN
      clos_new := COALESCE(NEW."statut", '') ~* 'clotur|classe';
      clos_old := COALESCE(OLD."statut", '') ~* 'clotur|classe';
      IF clos_new AND NOT clos_old THEN
        INSERT INTO "Notification"("id","type","titre","lien","clientNom","cibleId","ref","createdAt")
        VALUES (gen_random_uuid()::text, 'telegramme-clos',
                'Télégramme clôturé — ' || COALESCE(NEW."clientNom", 'Client'),
                '/communication/telegramme/' || NEW."id",
                COALESCE(NEW."clientNom", 'Client'), NEW."id",
                'tg-clos-' || NEW."id", now())
        ON CONFLICT ("ref") DO NOTHING;
      ELSE
        -- Nouvelle réponse : le tableau messages s'est allongé.
        n_old := COALESCE(jsonb_array_length(OLD."messages"), 0);
        n_new := COALESCE(jsonb_array_length(NEW."messages"), 0);
        IF n_new > n_old THEN
          dernier := NEW."messages" -> (n_new - 1);
          -- On ne notifie que les messages venant du CLIENT (pas nos propres réponses).
          IF COALESCE(dernier ->> 'from', '') <> 'equipe' THEN
            INSERT INTO "Notification"("id","type","titre","corps","lien","clientNom","cibleId","ref","createdAt")
            VALUES (gen_random_uuid()::text, 'message',
                    'Réponse du client — ' || COALESCE(NEW."clientNom", 'Client'),
                    LEFT(COALESCE(dernier ->> 'content', ''), 180),
                    '/communication/telegramme/' || NEW."id",
                    COALESCE(NEW."clientNom", 'Client'), NEW."id",
                    'tg-msg-' || NEW."id" || '-' || n_new, now())
            ON CONFLICT ("ref") DO NOTHING;
          END IF;
        END IF;
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

-- Rendez-vous clients (table Rdv) : nouvelle demande web/télégramme,
-- puis tout changement de statut (confirmation, annulation, lapin, clôture…).
CREATE OR REPLACE FUNCTION notif_rdv() RETURNS TRIGGER AS $$
DECLARE src text;
BEGIN
  BEGIN
    src := COALESCE(NEW."paiement" ->> 'source', '');
    IF TG_OP = 'INSERT' THEN
      IF src IN ('web', 'telegramme') THEN
        INSERT INTO "Notification"("id","type","titre","corps","lien","clientNom","cibleId","ref","createdAt")
        VALUES (gen_random_uuid()::text, 'rdv',
                'Nouvelle demande de RDV — ' || COALESCE(NEW."nomRP", 'Client'),
                NULLIF(CONCAT_WS(' · ', NEW."type", NEW."creneau"), ''),
                '/communication/rendez-vous/' || NEW."id",
                COALESCE(NEW."nomRP", 'Client'), NEW."id",
                'rdv-new-' || NEW."id", now())
        ON CONFLICT ("ref") DO NOTHING;
      END IF;
    ELSIF TG_OP = 'UPDATE' AND NEW."statut" IS DISTINCT FROM OLD."statut" THEN
      INSERT INTO "Notification"("id","type","titre","lien","clientNom","cibleId","ref","createdAt")
      VALUES (gen_random_uuid()::text, 'rdv-statut',
              'RDV ' || COALESCE(NEW."statut", '') || ' — ' || COALESCE(NEW."nomRP", 'Client'),
              '/communication/rendez-vous/' || NEW."id",
              COALESCE(NEW."nomRP", 'Client'), NEW."id",
              'rdv-statut-' || NEW."id" || '-' || COALESCE(NEW."statut", ''), now())
      ON CONFLICT ("ref") DO NOTHING;
    END IF;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

-- ── 3) Triggers (recréés proprement — idempotent) ───────────────────────────
DROP TRIGGER IF EXISTS "trg_notif_telegramme_web" ON "TelegrammeWeb";
CREATE TRIGGER "trg_notif_telegramme_web" AFTER INSERT OR UPDATE ON "TelegrammeWeb"
  FOR EACH ROW EXECUTE FUNCTION notif_telegramme_web();

DROP TRIGGER IF EXISTS "trg_notif_telegramme" ON "Telegramme";
CREATE TRIGGER "trg_notif_telegramme" AFTER INSERT OR UPDATE ON "Telegramme"
  FOR EACH ROW EXECUTE FUNCTION notif_telegramme();

DROP TRIGGER IF EXISTS "trg_notif_rdv" ON "Rdv";
CREATE TRIGGER "trg_notif_rdv" AFTER INSERT OR UPDATE ON "Rdv"
  FOR EACH ROW EXECUTE FUNCTION notif_rdv();

-- ── 4) Temps réel (navigateur) : réplication + RLS lecture ──────────────────
-- Le site LIT via la clé service_role (bypass RLS) → aucune lecture serveur
-- impactée. On ouvre seulement la lecture aux membres CONNECTÉS pour que
-- l'abonnement temps réel du navigateur reçoive les nouvelles lignes.
ALTER TABLE "Notification" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Notification_select_auth" ON "Notification";
CREATE POLICY "Notification_select_auth" ON "Notification" FOR SELECT TO authenticated USING (true);

-- Ajout à la publication temps réel de Supabase (si pas déjà présent).
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'Notification'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE "Notification";
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
