-- ═══════════════════════════════════════════════════════════════
--  ARMURERIE — RESSOURCES (matières premières achetées à la mine).
--  À exécuter UNE FOIS dans Supabase → SQL Editor. Additif & idempotent.
--  Table NEUVE (site-native, jamais réconciliée par le bot).
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS "ArmurerieRessource" (
  "id"        TEXT PRIMARY KEY,
  "nom"       TEXT NOT NULL,
  "prix"      numeric(14,2) DEFAULT 0,   -- coût unitaire d'achat à la mine
  "createdAt" TIMESTAMPTZ DEFAULT now(),
  "updatedAt" TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE "ArmurerieRessource" ENABLE ROW LEVEL SECURITY;
