-- ═══════════════════════════════════════════════════════════════════════════
--  CENTRE DE NOTIFICATIONS — Corbeille (soft-delete)
--  ⚠️  À exécuter dans le Supabase PRINCIPAL de l'IWC (SQL Editor).
--  100 % additif · idempotent (rejouable sans risque, aucune donnée touchée).
--
--  Ajoute la colonne "supprime" qui permet la CORBEILLE : une notification
--  supprimée est masquée (mise en corbeille) mais restaurable, au lieu d'être
--  détruite définitivement. Sans cette colonne, le site retombe proprement sur
--  une suppression définitive (le code est tolérant) — mais la corbeille et la
--  restauration ne fonctionnent qu'une fois la colonne présente.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "supprime" BOOLEAN NOT NULL DEFAULT false;

-- Filtre courant : « non supprimées » (le centre exclut la corbeille par défaut).
CREATE INDEX IF NOT EXISTS "Notification_supprime_idx" ON "Notification" ("supprime");
