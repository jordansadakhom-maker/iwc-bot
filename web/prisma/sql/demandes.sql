-- ═══════════════════════════════════════════════════════════════════════════
--  DEMANDES (tickets) — plateforme centrale IWC
--  ⚠️  À exécuter dans le Supabase PRINCIPAL de l'IWC (SQL Editor).
--  100 % additif · idempotent · RLS activée (accès service_role — le site
--  lit/écrit via cette clé). Discord ne sert qu'à notifier (lien profond).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Demande (le dossier) ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Demande" (
  "id"         TEXT PRIMARY KEY,
  "ref"        TEXT NOT NULL UNIQUE,                 -- DEM-AAAA-NNNNN
  "type"       TEXT NOT NULL DEFAULT 'autre',
  "titre"      TEXT NOT NULL,
  "resume"     TEXT,
  "priorite"   TEXT NOT NULL DEFAULT 'normale',      -- critique|elevee|normale|faible
  "statut"     TEXT NOT NULL DEFAULT 'nouvelle',     -- nouvelle|en_attente|en_cours|infos|attente_tiers|terminee|refusee|archivee
  "auteurId"   TEXT,                                 -- ID Discord de l'auteur
  "auteurNom"  TEXT NOT NULL DEFAULT 'Membre',
  "roleCible"  TEXT,                                 -- rôle à notifier (direction/officier/armurier…)
  "assigneId"  TEXT,                                 -- pris en charge par (ID Discord)
  "assigneNom" TEXT,
  "assigneAt"  TIMESTAMPTZ,
  "cibleId"    TEXT,                                 -- lien vers un élément source (opération, facture…)
  "lien"       TEXT,                                 -- deep-link éventuel
  "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"  TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedBy"  TEXT,
  "closedAt"   TIMESTAMPTZ,
  "annonceAt"  TIMESTAMPTZ                            -- marqueur d'annonce Discord (bot)
);
ALTER TABLE "Demande" ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS "Demande_statut_idx"  ON "Demande" ("statut", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "Demande_type_idx"    ON "Demande" ("type");
CREATE INDEX IF NOT EXISTS "Demande_assigne_idx" ON "Demande" (lower(coalesce("assigneId", '')));
CREATE INDEX IF NOT EXISTS "Demande_auteur_idx"  ON "Demande" (lower(coalesce("auteurId", '')));
CREATE INDEX IF NOT EXISTS "Demande_annonce_idx" ON "Demande" ("annonceAt") WHERE "annonceAt" IS NULL;

-- ── 2. Conversation (messages du dossier) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS "DemandeMessage" (
  "id"        TEXT PRIMARY KEY,
  "demandeId" TEXT NOT NULL,
  "auteurId"  TEXT,
  "auteurNom" TEXT NOT NULL DEFAULT 'Membre',
  "corps"     TEXT NOT NULL,
  "pieces"    JSONB NOT NULL DEFAULT '[]'::jsonb,    -- [{nom, url}]
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "editedAt"  TIMESTAMPTZ
);
ALTER TABLE "DemandeMessage" ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS "DemandeMessage_dem_idx" ON "DemandeMessage" ("demandeId", "createdAt");

-- ── 3. Historique (journal du dossier, append-only) ─────────────────────────
CREATE TABLE IF NOT EXISTS "DemandeEvent" (
  "id"        TEXT PRIMARY KEY,
  "demandeId" TEXT NOT NULL,
  "type"      TEXT NOT NULL,   -- creation|statut|prise_en_charge|transfert|message|cloture|reouverture
  "par"       TEXT,
  "details"   JSONB,
  "at"        TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE "DemandeEvent" ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS "DemandeEvent_dem_idx" ON "DemandeEvent" ("demandeId", "at");

-- ── 4. Numérotation lisible : DEM-AAAA-NNNNN ────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS "demande_ref_seq" START 1;
CREATE OR REPLACE FUNCTION "next_demande_ref"()
RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  RETURN 'DEM-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('demande_ref_seq')::text, 5, '0');
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
--  FIN — rejouable à volonté.
-- ═══════════════════════════════════════════════════════════════════════════
