-- ═══════════════════════════════════════════════════════════════════════════
--  PLATEFORME LSPD — SOCLE (schéma de base)
--  Serveur GTA V RP. À exécuter UNE FOIS dans le Supabase DÉDIÉ au LSPD
--  (projet séparé de Red Dead). Additif & idempotent.
--
--  RLS activée partout SANS politique publique → seules les actions serveur
--  (clé service_role) lisent/écrivent. Le journal d'audit n'est jamais modifié
--  par les utilisateurs.
--
--  Les GRADES par défaut vivent dans le code (repli). Cette table reste vide
--  tant que la hiérarchie n'est pas personnalisée depuis l'administration ;
--  une ligne ici REMPLACE le défaut pour la clé correspondante.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1) GRADES (hiérarchie configurable) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "LspdGrade" (
  "key"       TEXT PRIMARY KEY,                 -- clé stable référencée par LspdAgent.grade
  "nom"       TEXT NOT NULL,
  "ordre"     INTEGER NOT NULL DEFAULT 0,       -- plus grand = plus élevé
  "couleur"   TEXT,
  "perms"     JSONB NOT NULL DEFAULT '[]'::jsonb, -- liste de droits par action, ou ["*"]
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ,
  "updatedBy" TEXT
);
ALTER TABLE "LspdGrade" ENABLE ROW LEVEL SECURITY;

-- 2) UNITÉS (divisions spécialisées, configurables) ──────────────────────────
CREATE TABLE IF NOT EXISTS "LspdUnite" (
  "id"          TEXT PRIMARY KEY,
  "nom"         TEXT NOT NULL,                  -- ex. "Patrol Division", "SWAT", "K-9"
  "code"        TEXT,                           -- ex. "PATROL", "SWAT"
  "description" TEXT,
  "couleur"     TEXT,
  "ordre"       INTEGER NOT NULL DEFAULT 0,
  "actif"       BOOLEAN NOT NULL DEFAULT true,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"   TIMESTAMPTZ,
  "updatedBy"   TEXT
);
ALTER TABLE "LspdUnite" ENABLE ROW LEVEL SECURITY;

-- 3) AGENTS (effectif) ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "LspdAgent" (
  "id"              TEXT PRIMARY KEY,
  "identifiant"     TEXT,                       -- ID Discord (lien de connexion)
  "nom"             TEXT NOT NULL,              -- nom du personnage RP
  "matricule"       TEXT,
  "grade"           TEXT,                       -- → LspdGrade.key
  "unite"           TEXT,                       -- → LspdUnite.id (ou code)
  "dateIntegration" DATE,
  "statut"          TEXT NOT NULL DEFAULT 'actif', -- actif | probation | suspendu | reserve | parti
  "actif"           BOOLEAN NOT NULL DEFAULT true,
  "telephone"       TEXT,
  "note"            TEXT,
  "createdAt"       TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"       TIMESTAMPTZ,
  "updatedBy"       TEXT
);
CREATE INDEX IF NOT EXISTS "LspdAgent_identifiant_idx" ON "LspdAgent"("identifiant");
CREATE INDEX IF NOT EXISTS "LspdAgent_grade_idx" ON "LspdAgent"("grade");
ALTER TABLE "LspdAgent" ENABLE ROW LEVEL SECURITY;

-- 4) INTERVENTIONS (dispatch) ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "LspdIntervention" (
  "id"          TEXT PRIMARY KEY,
  "ref"         TEXT UNIQUE NOT NULL,           -- numéro de référence lisible (ex. INT-2A3F9K)
  "type"        TEXT,                           -- type d'incident (configurable)
  "priorite"    TEXT NOT NULL DEFAULT 'normale', -- basse | normale | haute | urgente
  "titre"       TEXT NOT NULL,
  "description" TEXT,
  "localisation" TEXT,
  "statut"      TEXT NOT NULL DEFAULT 'nouvelle', -- nouvelle|attente|prise|en_cours|renfort|resolue|cloturee
  "agents"      JSONB NOT NULL DEFAULT '[]'::jsonb, -- unités/agents affectés (déclaré)
  "chronologie" JSONB NOT NULL DEFAULT '[]'::jsonb, -- fil d'événements horodatés
  "resultat"    TEXT,
  "rapportId"   TEXT,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"   TIMESTAMPTZ,
  "createdBy"   TEXT,
  "clotureLe"   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS "LspdInterv_statut_idx" ON "LspdIntervention"("statut");
CREATE INDEX IF NOT EXISTS "LspdInterv_created_idx" ON "LspdIntervention"("createdAt" DESC);
ALTER TABLE "LspdIntervention" ENABLE ROW LEVEL SECURITY;

-- 5) JOURNAL D'AUDIT (non modifiable par les utilisateurs) ────────────────────
CREATE TABLE IF NOT EXISTS "LspdAudit" (
  "id"            TEXT PRIMARY KEY,
  "aggregate"     TEXT NOT NULL,                -- domaine (agent, intervention, armurerie…)
  "type"          TEXT NOT NULL,                -- événement précis
  "cibleId"       TEXT,
  "cibleLibelle"  TEXT,
  "avant"         JSONB,
  "apres"         JSONB,
  "payload"       JSONB,
  "parNom"        TEXT,
  "parId"         TEXT,
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "LspdAudit_created_idx" ON "LspdAudit"("createdAt" DESC);
CREATE INDEX IF NOT EXISTS "LspdAudit_agg_idx" ON "LspdAudit"("aggregate");
ALTER TABLE "LspdAudit" ENABLE ROW LEVEL SECURITY;
