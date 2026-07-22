-- Journal des mouvements de stock de l'armurerie (traçabilité complète).
-- Chaque déduction à la vente, fabrication, ajustement ou correction y est tracée :
-- date/heure, ressource ou produit, avant → après, origine et auteur.
--
-- À exécuter UNE FOIS dans Supabase → SQL Editor. Tant que la table n'existe pas,
-- le code ne plante pas : il n'enregistre simplement rien (best-effort).

CREATE TABLE IF NOT EXISTS "ArmurerieMouvementStock" (
  id          TEXT PRIMARY KEY,
  cible       TEXT NOT NULL DEFAULT 'ressource',   -- 'ressource' | 'produit'
  "refId"     TEXT,                                -- id de la ressource/produit concerné
  nom         TEXT,                                -- nom lisible (au moment du mouvement)
  delta       INTEGER NOT NULL DEFAULT 0,          -- négatif = sortie, positif = entrée
  avant       INTEGER,
  apres       INTEGER,
  origine     TEXT,                                -- 'vente' | 'fabrication' | 'ajustement' | 'ocr' | 'correction'
  detail      TEXT,                                -- ex. "Vente : Carabine Evans ×2 — Client X"
  par         TEXT,                                -- auteur de l'action
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE "ArmurerieMouvementStock" ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS "idx_armstock_created" ON "ArmurerieMouvementStock" ("createdAt" DESC);
CREATE INDEX IF NOT EXISTS "idx_armstock_ref"     ON "ArmurerieMouvementStock" ("refId");
