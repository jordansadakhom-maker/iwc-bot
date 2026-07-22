-- ═══════════════════════════════════════════════════════════════
--  DISPENSAIRE DE SAINT-DENIS — Rôles & Configuration (web-native).
--  Système de rôles PROPRE au Dispensaire (indépendant de l'auth Iron Wolf).
--  Séparé de l'armurerie. Additif & idempotent.
-- ═══════════════════════════════════════════════════════════════

-- Membres du dispensaire + rôle (identifiant = ID Discord OU nom du compte connecté)
CREATE TABLE IF NOT EXISTS "DispensaireMembre" (
  "id"           TEXT PRIMARY KEY,
  "identifiant"  TEXT,                                 -- ID Discord (idéal) ou nom, pour reconnaître le compte
  "nom"          TEXT NOT NULL,
  "role"         TEXT NOT NULL DEFAULT 'stagiaire',    -- directeur | adjoint | rh | medecin | infirmier | stagiaire
  "actif"        BOOLEAN NOT NULL DEFAULT true,
  "note"         TEXT,
  "createdAt"    TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"    TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedBy"    TEXT
);
ALTER TABLE "DispensaireMembre" ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS "DispensaireMembre_ident_idx" ON "DispensaireMembre" (lower(coalesce("identifiant", '')));
CREATE INDEX IF NOT EXISTS "DispensaireMembre_nom_idx" ON "DispensaireMembre" (lower("nom"));

-- Configuration / seuils (clé → valeur)
CREATE TABLE IF NOT EXISTS "DispensaireConfig" (
  "cle"        TEXT PRIMARY KEY,
  "valeur"     TEXT,
  "updatedAt"  TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedBy"  TEXT
);
ALTER TABLE "DispensaireConfig" ENABLE ROW LEVEL SECURITY;
