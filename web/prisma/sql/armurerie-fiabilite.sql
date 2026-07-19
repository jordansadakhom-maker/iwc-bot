-- ═══════════════════════════════════════════════════════════════
--  ARMURERIE — FIABILITÉ (à exécuter UNE FOIS dans Supabase → SQL Editor).
--  Regroupe : colonne recette, colonne nature, et le mouvement de coffre
--  ATOMIQUE (solde + journal en une seule transaction, sans course).
--  Additif & idempotent — aucune perte de données.
-- ═══════════════════════════════════════════════════════════════

-- 1) Recettes de craft sur les produits (ingrédients requis).
ALTER TABLE IF EXISTS "ArmurerieProduit" ADD COLUMN IF NOT EXISTS "recette" JSONB DEFAULT '[]'::jsonb;

-- 2) Ventilation comptable des dépenses : 'produit' ou 'charge'.
ALTER TABLE IF EXISTS "ArmurerieMouvementCoffre" ADD COLUMN IF NOT EXISTS "nature" TEXT;

-- 3) Mouvement de coffre atomique. Met à jour le solde (jamais < 0) ET
--    journalise le mouvement dans une seule transaction, puis renvoie le
--    nouveau solde. Empêche deux mouvements simultanés de s'écraser.
CREATE OR REPLACE FUNCTION armurerie_coffre_mouvement(
  p_id      TEXT,
  p_montant NUMERIC,
  p_sens    TEXT,
  p_motif   TEXT,
  p_auteur  TEXT,
  p_nature  TEXT
) RETURNS NUMERIC
LANGUAGE plpgsql
AS $$
DECLARE
  v_delta NUMERIC := CASE WHEN p_sens = 'sortie' THEN -ABS(p_montant) ELSE ABS(p_montant) END;
  v_solde NUMERIC;
BEGIN
  INSERT INTO "ArmurerieCoffre" ("id", "solde", "updatedAt")
    VALUES ('vanhorn', 0, now())
    ON CONFLICT ("id") DO NOTHING;

  UPDATE "ArmurerieCoffre"
    SET "solde" = GREATEST(0, "solde" + v_delta), "updatedAt" = now()
    WHERE "id" = 'vanhorn'
    RETURNING "solde" INTO v_solde;

  INSERT INTO "ArmurerieMouvementCoffre" ("id", "sens", "montant", "motif", "auteur", "nature", "createdAt")
    VALUES (p_id, p_sens, ABS(p_montant), p_motif, p_auteur, p_nature, now());

  RETURN v_solde;
END;
$$;
