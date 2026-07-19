-- ═══════════════════════════════════════════════════════════════
--  ARMURERIE — CARNET DE COMMANDE (bon de commande client).
--  À exécuter UNE FOIS dans Supabase → SQL Editor. Additif & idempotent.
--  Table NEUVE (site-native, jamais réconciliée par le bot).
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS "ArmurerieCommande" (
  "id"          TEXT PRIMARY KEY,
  "categorie"   TEXT,
  "clientNom"   TEXT,
  "clientPrenom" TEXT,
  "lignes"      JSONB DEFAULT '[]'::jsonb,   -- [{objet, qte, prixUnitaire}]
  "total"       numeric(14,2) DEFAULT 0,     -- cumul de toutes les piles
  "statut"      TEXT DEFAULT 'en_attente',   -- en_attente / prete / livree / annulee
  "notes"       TEXT,
  "createdAt"   TIMESTAMPTZ DEFAULT now(),
  "updatedAt"   TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE "ArmurerieCommande" ENABLE ROW LEVEL SECURITY;
