-- ═══════════════════════════════════════════════════════════════
--  MODULE CHASSE — gestion des viandes & ressources de chasse.
--  Site-native (écrit directement par le site via la clé service_role),
--  jamais réconcilié par le bot. À exécuter UNE FOIS dans Supabase → SQL
--  Editor. 100 % additif & idempotent (ré-exécutable sans rien casser).
--
--  Architecture évolutive : une « zone » = une charrette / un entrepôt / un
--  campement… Ajouter une zone = insérer une ligne dans "ChasseZone" (aucune
--  modification de code). Les ressources sont libres (n'importe quel nom) →
--  ajouter une ressource ne demande jamais de toucher au code non plus.
-- ═══════════════════════════════════════════════════════════════

-- ── 1) Zones de stockage (charrettes, entrepôts…) ──────────────
CREATE TABLE IF NOT EXISTS "ChasseZone" (
  "id"        TEXT PRIMARY KEY,             -- ex. 'c1', 'c2', 'entrepot'
  "nom"       TEXT NOT NULL,                -- ex. 'Charrette 1'
  "capacite"  INTEGER,                      -- capacité max (NULL = non définie)
  "ordre"     INTEGER NOT NULL DEFAULT 0,   -- ordre d'affichage
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE "ChasseZone" ENABLE ROW LEVEL SECURITY;

-- Les deux charrettes de base (ne réécrit rien si elles existent déjà).
INSERT INTO "ChasseZone" ("id","nom","ordre") VALUES
  ('c1','Charrette 1',1),
  ('c2','Charrette 2',2)
ON CONFLICT ("id") DO NOTHING;

-- ── 2) Stock : une ligne = une ressource dans une zone ─────────
CREATE TABLE IF NOT EXISTS "ChasseStock" (
  "id"        TEXT PRIMARY KEY,
  "zoneId"    TEXT NOT NULL,                -- → ChasseZone.id
  "nom"       TEXT NOT NULL,                -- ex. 'Viande de cerf'
  "quantite"  INTEGER NOT NULL DEFAULT 0,
  "seuil"     INTEGER,                      -- seuil de réappro (NULL = aucun)
  "categorie" TEXT,                         -- ex. 'Viandes', 'Peaux & Cuirs'
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE "ChasseStock" ENABLE ROW LEVEL SECURITY;
-- Une seule ligne par (zone, ressource) — insensible à la casse/accents.
CREATE UNIQUE INDEX IF NOT EXISTS "ChasseStock_zone_nom_uidx"
  ON "ChasseStock" ("zoneId", lower("nom"));
CREATE INDEX IF NOT EXISTS "ChasseStock_zone_idx" ON "ChasseStock" ("zoneId");

-- ── 3) Historique complet des mouvements ───────────────────────
CREATE TABLE IF NOT EXISTS "ChasseMouvement" (
  "id"          TEXT PRIMARY KEY,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT now(),
  "zoneId"      TEXT NOT NULL,
  "cibleZoneId" TEXT,                       -- zone d'arrivée (transferts)
  "nom"         TEXT NOT NULL,
  "type"        TEXT NOT NULL DEFAULT 'ajout', -- 'ajout'|'retrait'|'correction'|'transfert'|'ocr'|'suppression'
  "delta"       INTEGER NOT NULL DEFAULT 0,  -- négatif = sortie, positif = entrée
  "avant"       INTEGER,
  "apres"       INTEGER,
  "par"         TEXT,                        -- auteur de l'action
  "commentaire" TEXT
);
ALTER TABLE "ChasseMouvement" ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS "ChasseMouvement_created_idx" ON "ChasseMouvement" ("createdAt" DESC);
CREATE INDEX IF NOT EXISTS "ChasseMouvement_zone_idx"    ON "ChasseMouvement" ("zoneId");
