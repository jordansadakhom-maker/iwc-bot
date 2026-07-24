-- ═══════════════════════════════════════════════════════════════
--  IRON WOLF — État des notifications de l'Assistant (veille).
--  Couche persistée par-dessus les constats (dérivés) : permet de marquer
--  une notification En cours / Résolue / Archivée, et de la retrouver.
--  Cloisonné du dispensaire (table distincte). Additif & idempotent.
--  À exécuter dans le Supabase de l'IRON WOLF COMPANY.
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS "NotifEtatIWC" (
  "id"         TEXT PRIMARY KEY,          -- id stable du constat
  "etat"       TEXT NOT NULL DEFAULT 'nouveau', -- nouveau | en_cours | resolu | archive
  "updatedBy"  TEXT,
  "updatedAt"  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE "NotifEtatIWC" ENABLE ROW LEVEL SECURITY;
