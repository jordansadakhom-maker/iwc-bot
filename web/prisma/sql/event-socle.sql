-- ═══════════════════════════════════════════════════════════════════════════
--  SOCLE ÉVÉNEMENTIEL (Phase 1) — journal unique + projection d'audit
--  Additif & idempotent. À exécuter dans le Supabase PRINCIPAL (IWC).
--
--  "Event" = journal APPEND-ONLY de tout ce qui se passe (source de vérité).
--  "ActivityLog" = projection lisible (qui / quand / avant → après) alimentée
--  par trigger. On N'AFFECTE PAS le flux Notification existant (qui continue de
--  tourner) : ce socle s'ajoute à côté et sera généralisé plus tard.
--
--  Immutabilité : RLS activée SANS policy pour les rôles applicatifs → le
--  navigateur ne peut ni lire ni écrire ces tables ; seules les écritures
--  service_role (bot / server actions) passent. La purge/rétention reste donc
--  possible en service_role (pas de règle no_delete bloquante).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1) Journal append-only ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Event" (
  "id"           TEXT PRIMARY KEY,
  "aggregate"    TEXT NOT NULL,            -- domaine : 'contrat','rdv','coffre','membre'…
  "type"         TEXT NOT NULL,            -- ex. 'contrat.supprime','coffre.ajuste'
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
  "ref"          TEXT,                      -- clé d'idempotence facultative
  "priorite"     INT NOT NULL DEFAULT 0,
  "createdAt"    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "Event_ref_key"     ON "Event"("ref") WHERE "ref" IS NOT NULL;
CREATE INDEX        IF NOT EXISTS "Event_created_idx"  ON "Event"("createdAt" DESC);
CREATE INDEX        IF NOT EXISTS "Event_agg_idx"      ON "Event"("aggregate", "createdAt" DESC);
ALTER TABLE "Event" ENABLE ROW LEVEL SECURITY;   -- aucune policy → navigateur bloqué, service_role bypass

-- ── 2) Projection d'audit lisible ───────────────────────────────────────────
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

-- ── 3) Résilience : lettres mortes + curseurs de consommateurs ───────────────
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

-- ── 4) Projection Event → ActivityLog (défensive : ne bloque jamais) ────────
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
