-- ═══════════════════════════════════════════════════════════════════════════
--  FABRICATION DU DISPENSAIRE (Lot 4) — recettes matières → consommables
--  À exécuter dans le Supabase du DISPENSAIRE (projet séparé zcoqmc…).
--  Additif & idempotent — rejouable, ne casse rien.
--
--  « DispensaireRecette » = une recette de fabrication : des matières premières
--  (ingrédients) consommées produisent un article de stock (le produit). Fabriquer
--  décrémente les matières et incrémente le produit, le tout tracé (mouvement de
--  stock + journal d'événements).
--
--  Immutabilité applicative : RLS activée SANS policy → navigateur bloqué, seules
--  les écritures service_role (server actions) passent.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS "DispensaireRecette" (
  "id"             TEXT PRIMARY KEY,
  "nom"            TEXT NOT NULL,
  "produitNom"     TEXT NOT NULL,             -- nom du consommable produit
  "produitStockId" TEXT,                      -- article de stock produit (incrémenté)
  "rendement"      INT NOT NULL DEFAULT 1,    -- unités produites par lot
  "ingredients"    JSONB NOT NULL DEFAULT '[]',  -- [{ matiereId, nom, quantite }]
  "note"           TEXT,
  "createdAt"      TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"      TIMESTAMPTZ,
  "updatedBy"      TEXT
);

ALTER TABLE "DispensaireRecette" ENABLE ROW LEVEL SECURITY;
