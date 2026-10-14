-- ═══════════════════════════════════════════════════════════════════════════
--  PLATEFORME LSPD — COUCHE OPÉRATIONNELLE (service, radio, patrouilles)
--  À exécuter APRÈS 00-socle.sql dans le Supabase dédié LSPD. Additif & idempotent.
--  RLS activée partout (écritures via la clé service_role uniquement).
-- ═══════════════════════════════════════════════════════════════════════════

-- 1) CANAUX RADIO (configurables depuis l'administration) ─────────────────────
CREATE TABLE IF NOT EXISTS "LspdCanal" (
  "id"          TEXT PRIMARY KEY,
  "nom"         TEXT NOT NULL,
  "code"        TEXT,
  "type"        TEXT NOT NULL DEFAULT 'patrol', -- dispatch|patrol|traffic|detectives|tactical|command|training
  "description" TEXT,
  "ordre"       INTEGER NOT NULL DEFAULT 0,
  "actif"       BOOLEAN NOT NULL DEFAULT true,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"   TIMESTAMPTZ,
  "updatedBy"   TEXT
);
ALTER TABLE "LspdCanal" ENABLE ROW LEVEL SECURITY;

-- Structure de départ (modifiable / supprimable ensuite). Ne crée pas de doublon.
INSERT INTO "LspdCanal" ("id","nom","code","type","ordre","actif") VALUES
  ('can-dispatch','Dispatch principal','DISPATCH','dispatch',10,true),
  ('can-patrol1','Patrol 1','PATROL1','patrol',20,true),
  ('can-patrol2','Patrol 2','PATROL2','patrol',30,true),
  ('can-traffic','Traffic','TRAFFIC','traffic',40,true),
  ('can-detectives','Detectives','DET','detectives',50,true),
  ('can-tactical','Tactical','TAC','tactical',60,true),
  ('can-command','Command','CMD','command',70,true),
  ('can-training','Training','TRN','training',80,true)
ON CONFLICT ("id") DO NOTHING;

-- 2) SERVICE (prise de service / statut radio) ───────────────────────────────
-- Une ligne par PRISE de service. Service OUVERT = "fin" NULL.
CREATE TABLE IF NOT EXISTS "LspdService" (
  "id"          TEXT PRIMARY KEY,
  "agentId"     TEXT NOT NULL,                 -- → LspdAgent.id
  "agentNom"    TEXT NOT NULL,
  "matricule"   TEXT,
  "indicatif"   TEXT,                          -- indicatif du jour (ex. A-12)
  "canalId"     TEXT,                          -- → LspdCanal.id
  "canalNom"    TEXT,
  "unite"       TEXT,
  "statutRadio" TEXT NOT NULL DEFAULT 'dispo', -- dispo | occupe | intervention | indispo
  "debut"       TIMESTAMPTZ NOT NULL DEFAULT now(),
  "fin"         TIMESTAMPTZ,
  "note"        TEXT,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS "LspdService_agent_idx" ON "LspdService"("agentId");
CREATE INDEX IF NOT EXISTS "LspdService_ouvert_idx" ON "LspdService"("fin");
-- Un seul service OUVERT par agent (empêche les doublons de prise de service).
CREATE UNIQUE INDEX IF NOT EXISTS "LspdService_un_ouvert" ON "LspdService"("agentId") WHERE "fin" IS NULL;
-- Un indicatif n'est pris que par UN service ouvert à la fois (anti-collision).
CREATE UNIQUE INDEX IF NOT EXISTS "LspdService_indicatif_unique" ON "LspdService"("indicatif") WHERE "fin" IS NULL AND "indicatif" IS NOT NULL;
ALTER TABLE "LspdService" ENABLE ROW LEVEL SECURITY;

-- 3) PATROUILLES (ADAM) — prêt pour le module patrouilles ─────────────────────
CREATE TABLE IF NOT EXISTS "LspdPatrouille" (
  "id"            TEXT PRIMARY KEY,
  "ref"           TEXT UNIQUE NOT NULL,
  "indicatif"     TEXT,
  "type"          TEXT,
  "chefId"        TEXT,
  "chefNom"       TEXT,
  "membres"       JSONB NOT NULL DEFAULT '[]'::jsonb, -- [{agentId, nom, indicatif}]
  "vehicule"      TEXT,
  "canalId"       TEXT,
  "secteur"       TEXT,
  "statut"        TEXT NOT NULL DEFAULT 'preparation', -- preparation|constitue|en_service|intervention|indispo|dispo|terminee
  "debut"         TIMESTAMPTZ,
  "fin"           TIMESTAMPTZ,
  "interventionId" TEXT,
  "journal"       JSONB NOT NULL DEFAULT '[]'::jsonb,
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"     TIMESTAMPTZ,
  "createdBy"     TEXT
);
CREATE INDEX IF NOT EXISTS "LspdPatrouille_statut_idx" ON "LspdPatrouille"("statut");
CREATE UNIQUE INDEX IF NOT EXISTS "LspdPatrouille_indicatif_actif" ON "LspdPatrouille"("indicatif") WHERE "fin" IS NULL AND "indicatif" IS NOT NULL;
ALTER TABLE "LspdPatrouille" ENABLE ROW LEVEL SECURITY;

-- 4) CONFIGURATION (plans d'indicatifs, consignes de service, règles) ─────────
CREATE TABLE IF NOT EXISTS "LspdConfig" (
  "key"       TEXT PRIMARY KEY,
  "value"     JSONB,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedBy" TEXT
);
ALTER TABLE "LspdConfig" ENABLE ROW LEVEL SECURITY;
