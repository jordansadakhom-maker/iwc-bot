-- ═══════════════════════════════════════════════════════════════════════════
--  CENTRE DE NOTIFICATIONS — v2 : Contrats, Opérations, Candidatures
--
--  Prolonge notifications-centre.sql (Télégrammes + RDV) aux événements qui
--  n'étaient PAS encore couverts : nouveau contrat & changement de statut,
--  nouvelle opération & changement de phase, nouvelle candidature & décision.
--
--  Même contrat de sûreté que la v1 :
--   • Additif & idempotent (ré-exécutable sans effet de bord).
--   • Chaque fonction avale toute erreur (EXCEPTION WHEN OTHERS THEN NULL) :
--     un trigger ne bloque JAMAIS l'écriture parente (contrat/op/candidature).
--   • Anti-doublons par "ref" (index unique déjà créé en v1) → une même
--     transition (ex. "contrat-statut-<id>-signe") ne notifie qu'une fois,
--     même si supabase-sync ré-upserte la ligne en boucle.
--
--  Ces tables sont alimentées soit par le site (Candidature via /rejoindre),
--  soit par le bot (Contrat/Operation via supabase-sync upsert). Comme
--  l'upsert d'une ligne EXISTANTE emprunte le chemin UPDATE (ON CONFLICT),
--  déployer ce script ne "rejoue" pas l'historique : seuls les vrais INSERT
--  et les vrais changements de statut/phase créent une notification.
--
--  À exécuter dans le Supabase PRINCIPAL (IWC), après notifications-centre.sql.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Contrats (table "Contrat") : nouveau + changement de statut ──────────────
-- statut par défaut = 'en_attente' ; passe à signe/refuse/… lors du traitement.
CREATE OR REPLACE FUNCTION notif_contrat() RETURNS TRIGGER AS $$
BEGIN
  BEGIN
    IF TG_OP = 'INSERT' THEN
      INSERT INTO "Notification"("id","type","titre","corps","lien","clientNom","cibleId","ref","createdAt")
      VALUES (gen_random_uuid()::text, 'contrat',
              'Nouveau contrat — ' || COALESCE(NEW."cible", 'cible inconnue'),
              NULLIF(CONCAT_WS(' · ', NEW."motif", NEW."remuneration"), ''),
              '/operations',
              COALESCE(NEW."commanditaire", NEW."cible"), NEW."id",
              'contrat-new-' || NEW."id", now())
      ON CONFLICT ("ref") DO NOTHING;
    ELSIF TG_OP = 'UPDATE' AND NEW."statut" IS DISTINCT FROM OLD."statut" THEN
      INSERT INTO "Notification"("id","type","titre","lien","clientNom","cibleId","ref","createdAt")
      VALUES (gen_random_uuid()::text, 'contrat-statut',
              'Contrat ' || COALESCE(NEW."statut", '') || ' — ' || COALESCE(NEW."cible", 'cible inconnue'),
              '/operations',
              COALESCE(NEW."commanditaire", NEW."cible"), NEW."id",
              'contrat-statut-' || NEW."id" || '-' || COALESCE(NEW."statut", ''), now())
      ON CONFLICT ("ref") DO NOTHING;
    END IF;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

-- ── Opérations (table "Operation") : nouvelle + changement de PHASE ──────────
-- Attention : l'opération n'a pas de "statut" mais une "phase" (enum
-- PhaseOperation : preparation | en_cours | terminee | annulee).
CREATE OR REPLACE FUNCTION notif_operation() RETURNS TRIGGER AS $$
BEGIN
  BEGIN
    IF TG_OP = 'INSERT' THEN
      INSERT INTO "Notification"("id","type","titre","corps","lien","clientNom","cibleId","ref","createdAt")
      VALUES (gen_random_uuid()::text, 'operation',
              'Nouvelle opération — ' || COALESCE(NEW."cible", 'cible inconnue'),
              NULLIF(CONCAT_WS(' · ', NEW."categorie", NEW."prime"), ''),
              '/operations',
              COALESCE(NEW."cible", 'Opération'), NEW."id",
              'op-new-' || NEW."id", now())
      ON CONFLICT ("ref") DO NOTHING;
    ELSIF TG_OP = 'UPDATE' AND NEW."phase" IS DISTINCT FROM OLD."phase" THEN
      INSERT INTO "Notification"("id","type","titre","corps","lien","clientNom","cibleId","ref","createdAt")
      VALUES (gen_random_uuid()::text, 'operation-statut',
              'Opération ' || REPLACE(NEW."phase"::text, '_', ' ') || ' — ' || COALESCE(NEW."cible", 'cible inconnue'),
              NEW."categorie",
              '/operations',
              COALESCE(NEW."cible", 'Opération'), NEW."id",
              'op-phase-' || NEW."id" || '-' || NEW."phase"::text, now())
      ON CONFLICT ("ref") DO NOTHING;
    END IF;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

-- ── Candidatures (table "Candidature") : nouvelle + décision ────────────────
-- La colonne booléenne "notifieDiscord" est basculée par le bot : ce n'est PAS
-- un changement de statut, donc ça ne re-notifie pas (on ne réagit qu'à "statut").
CREATE OR REPLACE FUNCTION notif_candidature() RETURNS TRIGGER AS $$
BEGIN
  BEGIN
    IF TG_OP = 'INSERT' THEN
      INSERT INTO "Notification"("id","type","titre","corps","lien","clientNom","cibleId","ref","createdAt")
      VALUES (gen_random_uuid()::text, 'candidature',
              'Nouvelle candidature — ' || COALESCE(NEW."nomRP", 'Candidat'),
              NEW."pole"::text,
              '/recrutement',
              COALESCE(NEW."nomRP", 'Candidat'), NEW."id",
              'cand-new-' || NEW."id", now())
      ON CONFLICT ("ref") DO NOTHING;
    ELSIF TG_OP = 'UPDATE' AND NEW."statut" IS DISTINCT FROM OLD."statut" THEN
      INSERT INTO "Notification"("id","type","titre","lien","clientNom","cibleId","ref","createdAt")
      VALUES (gen_random_uuid()::text, 'candidature-statut',
              'Candidature ' || COALESCE(NEW."statut", '') || ' — ' || COALESCE(NEW."nomRP", 'Candidat'),
              '/recrutement',
              COALESCE(NEW."nomRP", 'Candidat'), NEW."id",
              'cand-statut-' || NEW."id" || '-' || COALESCE(NEW."statut", ''), now())
      ON CONFLICT ("ref") DO NOTHING;
    END IF;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

-- ── Triggers (recréés proprement — idempotent) ──────────────────────────────
DROP TRIGGER IF EXISTS "trg_notif_contrat" ON "Contrat";
CREATE TRIGGER "trg_notif_contrat" AFTER INSERT OR UPDATE ON "Contrat"
  FOR EACH ROW EXECUTE FUNCTION notif_contrat();

DROP TRIGGER IF EXISTS "trg_notif_operation" ON "Operation";
CREATE TRIGGER "trg_notif_operation" AFTER INSERT OR UPDATE ON "Operation"
  FOR EACH ROW EXECUTE FUNCTION notif_operation();

DROP TRIGGER IF EXISTS "trg_notif_candidature" ON "Candidature";
CREATE TRIGGER "trg_notif_candidature" AFTER INSERT OR UPDATE ON "Candidature"
  FOR EACH ROW EXECUTE FUNCTION notif_candidature();
