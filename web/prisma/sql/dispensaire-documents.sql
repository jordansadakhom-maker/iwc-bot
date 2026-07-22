-- ═══════════════════════════════════════════════════════════════
--  DISPENSAIRE DE SAINT-DENIS — Certificats, Rapports & Documents.
--  Totalement séparé de l'armurerie (tables préfixées « Dispensaire »).
--  À exécuter UNE FOIS dans Supabase. Additif & idempotent.
-- ═══════════════════════════════════════════════════════════════

-- 1) Certificats médicaux (remplissage rapide)
CREATE TABLE IF NOT EXISTS "DispensaireCertificat" (
  "id"          TEXT PRIMARY KEY,
  "patient"     TEXT NOT NULL,
  "type"        TEXT NOT NULL DEFAULT 'aptitude',    -- aptitude | repos | blessure | deces | autre
  "medecin"     TEXT,
  "dateActe"    DATE,
  "dureeRepos"  INTEGER NOT NULL DEFAULT 0,          -- jours de repos (si applicable)
  "contenu"     TEXT,
  "note"        TEXT,
  "par"         TEXT,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE "DispensaireCertificat" ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS "DispensaireCertificat_date_idx" ON "DispensaireCertificat" ("createdAt" DESC);
CREATE INDEX IF NOT EXISTS "DispensaireCertificat_patient_idx" ON "DispensaireCertificat" (lower("patient"));

-- 2) Rapports médicaux (liens Canva)
CREATE TABLE IF NOT EXISTS "DispensaireRapport" (
  "id"         TEXT PRIMARY KEY,
  "titre"      TEXT NOT NULL,
  "categorie"  TEXT,
  "patient"    TEXT,
  "lien"       TEXT,                                  -- lien Canva (ou autre)
  "auteur"     TEXT,
  "note"       TEXT,                                  -- description
  "par"        TEXT,
  "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE "DispensaireRapport" ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS "DispensaireRapport_date_idx" ON "DispensaireRapport" ("createdAt" DESC);

-- 3) Documents (fichiers téléversés ou liens externes)
CREATE TABLE IF NOT EXISTS "DispensaireDocument" (
  "id"         TEXT PRIMARY KEY,
  "titre"      TEXT NOT NULL,
  "categorie"  TEXT,
  "type"       TEXT NOT NULL DEFAULT 'lien',          -- fichier | lien
  "url"        TEXT,
  "note"       TEXT,
  "par"        TEXT,
  "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE "DispensaireDocument" ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS "DispensaireDocument_date_idx" ON "DispensaireDocument" ("createdAt" DESC);
