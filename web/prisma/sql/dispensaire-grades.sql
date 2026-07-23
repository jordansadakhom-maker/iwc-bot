-- ═══════════════════════════════════════════════════════════════
--  DISPENSAIRE DE SAINT-DENIS — Grades dynamiques & permissions.
--  Les grades ne sont plus figés dans le code : ils sont gérés depuis
--  l'administration (créer / renommer / réordonner / droits). Cette table
--  en est le support. Additif & idempotent — n'altère aucune donnée.
--  À exécuter dans l'éditeur SQL du projet Supabase du DISPENSAIRE.
-- ═══════════════════════════════════════════════════════════════

-- Grades du dispensaire. `id` = clé stable (référencée par DispensaireMembre.role).
-- `ordre` = rang hiérarchique (plus grand = plus élevé). `voir` est toujours vrai
-- (tout grade peut consulter) → non stocké. Les autres droits sont des booléens.
CREATE TABLE IF NOT EXISTS "DispensaireGrade" (
  "id"         TEXT PRIMARY KEY,
  "nom"        TEXT NOT NULL,
  "ordre"      INTEGER NOT NULL DEFAULT 0,
  "admin"      BOOLEAN NOT NULL DEFAULT false,   -- gère membres, grades, paramètres
  "rh"         BOOLEAN NOT NULL DEFAULT false,   -- ressources humaines
  "factures"   BOOLEAN NOT NULL DEFAULT false,   -- facturation
  "stock"      BOOLEAN NOT NULL DEFAULT false,   -- stockage & coffres (modifier)
  "medical"    BOOLEAN NOT NULL DEFAULT false,   -- dossiers médicaux
  "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"  TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedBy"  TEXT
);
ALTER TABLE "DispensaireGrade" ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS "DispensaireGrade_ordre_idx" ON "DispensaireGrade" ("ordre" DESC);

-- Graine : grades par défaut (serveur Reckless). Idempotent : ne réécrit rien
-- si les grades existent déjà (tu peux donc les renommer sans qu'ils reviennent).
INSERT INTO "DispensaireGrade" ("id", "nom", "ordre", "admin", "rh", "factures", "stock", "medical") VALUES
  ('directeur', 'Directeur',         5, true,  true,  true,  true,  true),
  ('adjoint',   'Adjoint',           4, true,  true,  true,  true,  true),
  ('referent',  'Médecin Référent',  3, false, true,  false, true,  true),
  ('medecin',   'Médecin',           2, false, false, false, true,  true),
  ('apprenti',  'Apprenti Médecin',  1, false, false, false, false, true)
ON CONFLICT ("id") DO NOTHING;
