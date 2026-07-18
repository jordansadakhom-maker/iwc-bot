-- ═══════════════════════════════════════════════════════════════
--  File d'attente des fiches de contact ajoutées DEPUIS LE SITE.
--  Le site (espace interne) y insère une demande ; le bot Discord la relève,
--  crée la vraie fiche (carnet + post de forum) puis la marque « cree ».
--  À exécuter UNE FOIS dans Supabase → SQL Editor (fenêtre privée pour éviter
--  la traduction Chrome). Idempotent (IF NOT EXISTS).
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS "DemandeContact" (
  "id"          TEXT PRIMARY KEY,
  "nom"         TEXT NOT NULL,
  "type"        TEXT,
  "telegramme"  TEXT,
  "metier"      TEXT,
  "secteur"     TEXT,
  "affiliation" TEXT,
  "relation"    TEXT,
  "fiabilite"   INTEGER,
  "statutRP"    TEXT,
  "notes"       TEXT,
  "creeParNom"  TEXT,
  "contactId"   TEXT,
  "statut"      TEXT NOT NULL DEFAULT 'nouveau',
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Sécurité : RLS activée sans politique publique → seule la clé service_role
-- (utilisée par le bot ET par les actions serveur du site) peut lire/écrire.
ALTER TABLE "DemandeContact" ENABLE ROW LEVEL SECURITY;
