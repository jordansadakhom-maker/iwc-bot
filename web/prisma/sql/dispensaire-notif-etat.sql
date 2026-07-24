-- ═══════════════════════════════════════════════════════════════
--  DISPENSAIRE — État des notifications de l'Assistant (veille).
--  Couche persistée par-dessus les constats (dérivés) : permet de marquer
--  une notification En cours / Résolue / Archivée, et de la retrouver.
--  Additif & idempotent. À exécuter dans le Supabase du DISPENSAIRE.
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS "DispensaireNotifEtat" (
  "id"         TEXT PRIMARY KEY,          -- id stable du constat
  "etat"       TEXT NOT NULL DEFAULT 'nouveau', -- nouveau | en_cours | resolu | archive
  "updatedBy"  TEXT,
  "updatedAt"  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE "DispensaireNotifEtat" ENABLE ROW LEVEL SECURITY;
