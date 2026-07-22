-- ═══════════════════════════════════════════════════════════════
--  DISPENSAIRE DE SAINT-DENIS — Stockage (web-native).
--  Articles rangés par coffre, avec stock GLISSANT (actuel), stock FIXE
--  (référence/cible) et SEUIL d'alerte. Chaque mouvement (± quantité) est
--  tracé : qui, quand, motif — pour une traçabilité complète des coffres.
--  Matières premières = simple catégorie avec seuil.
--  À exécuter UNE FOIS dans Supabase. Additif & idempotent.
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS "DispensaireStock" (
  "id"         TEXT PRIMARY KEY,
  "nom"        TEXT NOT NULL,
  "categorie"  TEXT NOT NULL DEFAULT 'materiel',       -- medicament | materiel | matiere | nourriture | autre
  "coffre"     TEXT,                                    -- emplacement / coffre
  "unite"      TEXT,                                    -- u, flacon, kg…
  "stock"      INTEGER NOT NULL DEFAULT 0,              -- stock GLISSANT (actuel)
  "stockFixe"  INTEGER NOT NULL DEFAULT 0,              -- stock FIXE (référence / cible)
  "seuil"      INTEGER NOT NULL DEFAULT 0,              -- seuil d'alerte (0 = pas d'alerte)
  "note"       TEXT,
  "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"  TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedBy"  TEXT
);
ALTER TABLE "DispensaireStock" ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS "DispensaireStock_coffre_idx" ON "DispensaireStock" (lower(coalesce("coffre", '')));

-- Journal des mouvements (traçabilité des coffres).
CREATE TABLE IF NOT EXISTS "DispensaireStockMouvement" (
  "id"         TEXT PRIMARY KEY,
  "stockId"    TEXT,
  "nomItem"    TEXT NOT NULL,
  "coffre"     TEXT,
  "delta"      INTEGER NOT NULL,                        -- ± quantité
  "apres"      INTEGER,                                 -- stock résultant après le mouvement
  "motif"      TEXT,
  "par"        TEXT,
  "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE "DispensaireStockMouvement" ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS "DispensaireStockMouvement_date_idx" ON "DispensaireStockMouvement" ("createdAt" DESC);
CREATE INDEX IF NOT EXISTS "DispensaireStockMouvement_item_idx" ON "DispensaireStockMouvement" ("stockId");
