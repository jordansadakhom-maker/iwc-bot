-- ═══════════════════════════════════════════════════════════════════════════
--  TÂCHES — module unifié (table canonique, site-native)
--  Additif & idempotent. À exécuter dans le Supabase PRINCIPAL (IWC).
--
--  Table NÉE DU SITE : le bot n'en est pas la source de vérité → elle est
--  ajoutée à la liste _JAMAIS_RECONCILIER de supabase-sync (jamais supprimée par
--  la synchro). RLS activée sans policy applicative : le site lit/écrit en
--  service_role, le navigateur n'y touche pas directement.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS "Tache" (
  "id"         TEXT PRIMARY KEY,
  "titre"      TEXT NOT NULL,
  "detail"     TEXT,
  "assigneId"  TEXT,                              -- Membre.id (Discord) assigné
  "assigneNom" TEXT,
  "pole"       TEXT,                              -- iwc / confrerie / null
  "priorite"   TEXT NOT NULL DEFAULT 'normale',   -- basse / normale / haute / urgente
  "echeance"   TIMESTAMPTZ,
  "statut"     TEXT NOT NULL DEFAULT 'a_faire',   -- a_faire / en_cours / faite
  "source"     TEXT DEFAULT 'manuel',
  "creePar"    TEXT,
  "creeParId"  TEXT,
  "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"  TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedBy"  TEXT
);
CREATE INDEX IF NOT EXISTS "Tache_statut_idx"   ON "Tache"("statut", "priorite");
CREATE INDEX IF NOT EXISTS "Tache_assigne_idx"  ON "Tache"("assigneId", "statut");
CREATE INDEX IF NOT EXISTS "Tache_echeance_idx" ON "Tache"("echeance") WHERE "echeance" IS NOT NULL;
ALTER TABLE "Tache" ENABLE ROW LEVEL SECURITY;
