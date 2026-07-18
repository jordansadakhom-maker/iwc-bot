-- ═══════════════════════════════════════════════════════════════
--  File de commandes venues du SITE (créer / modifier / supprimer).
--  Le site (espace interne) y dépose une commande ; le bot Discord l'applique
--  à ses vraies données (data.json) toutes les ~30 s, puis resynchronise le
--  site. Le bot reste la SOURCE DE VÉRITÉ : rien ne peut désynchroniser.
--  À exécuter UNE FOIS dans Supabase → SQL Editor (fenêtre privée pour éviter
--  la traduction Chrome). Idempotent (IF NOT EXISTS).
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS "CommandeWeb" (
  "id"        TEXT PRIMARY KEY,
  "type"      TEXT NOT NULL,                       -- ex : 'medical.update', 'operation.create'
  "payload"   JSONB NOT NULL DEFAULT '{}'::jsonb,
  "auteurNom" TEXT,
  "auteurId"  TEXT,
  "statut"    TEXT NOT NULL DEFAULT 'nouveau',     -- nouveau | applique | echec
  "resultat"  TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "CommandeWeb_statut_idx" ON "CommandeWeb" ("statut", "createdAt");

-- Sécurité : RLS activée sans politique publique → seule la clé service_role
-- (bot + actions serveur du site) peut lire/écrire.
ALTER TABLE "CommandeWeb" ENABLE ROW LEVEL SECURITY;
