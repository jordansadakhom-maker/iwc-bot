-- ═══════════════════════════════════════════════════════════════════════════
--  SOCLE ÉVÉNEMENTIEL DU DISPENSAIRE (Lot 1) — journal unique + projection audit
--  À exécuter dans le Supabase du DISPENSAIRE (projet séparé zcoqmc…).
--  Additif & idempotent — rejouable autant de fois que voulu, ne casse rien.
--
--  « DispensaireEvent »        = journal APPEND-ONLY de tout acte (source de vérité).
--  « DispensaireActivityLog »  = projection lisible (qui / quand / avant → après),
--                                alimentée automatiquement par trigger.
--
--  Le flux existant (notifications dérivées, journaux de stock…) continue de
--  tourner : ce socle s'ajoute À CÔTÉ et sera généralisé progressivement.
--
--  Immutabilité : RLS activée SANS policy → le navigateur ne peut ni lire ni
--  écrire ; seules les écritures service_role (server actions) passent. La purge
--  reste possible en service_role.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1) Journal append-only ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "DispensaireEvent" (
  "id"           TEXT PRIMARY KEY,
  "aggregate"    TEXT NOT NULL,            -- domaine : 'membre','grade','salarie','stock'…
  "type"         TEXT NOT NULL,            -- ex. 'membre.cree','grade.maj','salarie.supprime'
  "actorId"      TEXT,
  "actorNom"     TEXT,
  "cibleId"      TEXT,
  "cibleLibelle" TEXT,
  "avant"        JSONB,
  "apres"        JSONB,
  "payload"      JSONB,
  "ref"          TEXT,                      -- clé d'idempotence facultative
  "priorite"     INT NOT NULL DEFAULT 0,
  "createdAt"    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "DispensaireEvent_ref_key"    ON "DispensaireEvent"("ref") WHERE "ref" IS NOT NULL;
CREATE INDEX        IF NOT EXISTS "DispensaireEvent_created_idx" ON "DispensaireEvent"("createdAt" DESC);
CREATE INDEX        IF NOT EXISTS "DispensaireEvent_agg_idx"     ON "DispensaireEvent"("aggregate", "createdAt" DESC);
ALTER TABLE "DispensaireEvent" ENABLE ROW LEVEL SECURITY;

-- ── 2) Projection d'audit lisible ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "DispensaireActivityLog" (
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
CREATE INDEX IF NOT EXISTS "DispensaireActivityLog_at_idx"  ON "DispensaireActivityLog"("at" DESC);
CREATE INDEX IF NOT EXISTS "DispensaireActivityLog_mod_idx" ON "DispensaireActivityLog"("module", "at" DESC);
ALTER TABLE "DispensaireActivityLog" ENABLE ROW LEVEL SECURITY;

-- ── 3) Résilience : lettres mortes + curseurs de consommateurs ───────────────
CREATE TABLE IF NOT EXISTS "DispensaireEventDeadLetter" (
  "id"       TEXT PRIMARY KEY,
  "contexte" JSONB,
  "erreur"   TEXT,
  "at"       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS "DispensaireEventCursor" (
  "consumer"    TEXT PRIMARY KEY,
  "lastEventId" TEXT,
  "lastRunAt"   TIMESTAMPTZ
);

-- ── 4) Projection DispensaireEvent → DispensaireActivityLog (ne bloque jamais) ─
CREATE OR REPLACE FUNCTION dispensaire_audit_from_event() RETURNS TRIGGER AS $$
BEGIN
  BEGIN
    INSERT INTO "DispensaireActivityLog"("id","module","action","cible","cibleId","avant","apres","par","parId","at")
    VALUES (gen_random_uuid()::text, NEW."aggregate", NEW."type", NEW."cibleLibelle", NEW."cibleId",
            NEW."avant", NEW."apres", NEW."actorNom", NEW."actorId", NEW."createdAt");
  EXCEPTION WHEN OTHERS THEN
    BEGIN
      INSERT INTO "DispensaireEventDeadLetter"("id","contexte","erreur","at")
      VALUES (gen_random_uuid()::text, to_jsonb(NEW), SQLERRM, now());
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_dispensaire_audit_from_event" ON "DispensaireEvent";
CREATE TRIGGER "trg_dispensaire_audit_from_event" AFTER INSERT ON "DispensaireEvent"
  FOR EACH ROW EXECUTE FUNCTION dispensaire_audit_from_event();
