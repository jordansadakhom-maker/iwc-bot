-- ═══════════════════════════════════════════════════════════════
--  RÉPERTOIRE DES CONTACTS — Dispensaire de Saint-Denis (web-native).
--  Reprend le salon Discord des fiches contacts : catégories, fiches
--  complètes, historique des modifications. Écrit directement par le site
--  (clé service_role), jamais réconcilié par le bot.
--  À exécuter UNE FOIS. 100 % additif & idempotent.
-- ═══════════════════════════════════════════════════════════════

-- ── Catégories (Fournisseurs, Entreprises, Artisans, Mines…) ────
CREATE TABLE IF NOT EXISTS "DispensaireCategorie" (
  "id"        TEXT PRIMARY KEY,
  "nom"       TEXT NOT NULL,
  "couleur"   TEXT,                          -- pastille (optionnel)
  "ordre"     INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE "DispensaireCategorie" ENABLE ROW LEVEL SECURITY;

INSERT INTO "DispensaireCategorie" ("id","nom","ordre") VALUES
  ('cat-fournisseurs','Fournisseurs',1),
  ('cat-entreprises','Entreprises',2),
  ('cat-services','Services publics',3),
  ('cat-artisans','Artisans',4),
  ('cat-mines','Mines',5),
  ('cat-menuiseries','Menuiseries',6),
  ('cat-armuriers','Armuriers',7),
  ('cat-autres','Autres partenaires',8)
ON CONFLICT ("id") DO NOTHING;

-- ── Fiches contacts ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "DispensaireContact" (
  "id"               TEXT PRIMARY KEY,
  "categorieId"      TEXT,                    -- → DispensaireCategorie.id
  "nom"              TEXT NOT NULL,           -- entreprise / personne
  "responsable"      TEXT,
  "description"      TEXT,
  "adresse"          TEXT,
  "telegramme"       TEXT,
  "contactSecondaire" TEXT,
  "horaires"         TEXT,
  "notes"            TEXT,
  -- commercial
  "typeService"      TEXT,
  "produits"         TEXT,
  "tarifs"           TEXT,
  "banque"           TEXT,                    -- infos bancaires (si présentes)
  "moyensContact"    TEXT,
  "source"           TEXT NOT NULL DEFAULT 'site', -- 'site' | 'discord'
  "createdAt"        TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"        TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedBy"        TEXT
);
ALTER TABLE "DispensaireContact" ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS "DispensaireContact_cat_idx" ON "DispensaireContact" ("categorieId");
CREATE INDEX IF NOT EXISTS "DispensaireContact_nom_idx" ON "DispensaireContact" (lower("nom"));

-- ── Historique des modifications (qui / quand / avant → après) ──
CREATE TABLE IF NOT EXISTS "DispensaireHistorique" (
  "id"         TEXT PRIMARY KEY,
  "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT now(),
  "contactId"  TEXT,
  "contactNom" TEXT,
  "action"     TEXT NOT NULL DEFAULT 'modification', -- 'creation'|'modification'|'suppression'|'import'
  "champ"      TEXT,
  "ancien"     TEXT,
  "nouveau"    TEXT,
  "par"        TEXT
);
ALTER TABLE "DispensaireHistorique" ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS "DispensaireHistorique_created_idx" ON "DispensaireHistorique" ("createdAt" DESC);
CREATE INDEX IF NOT EXISTS "DispensaireHistorique_contact_idx" ON "DispensaireHistorique" ("contactId");
