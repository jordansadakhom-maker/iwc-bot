-- ═══════════════════════════════════════════════════════════════════════════
--  ARMURERIE — décrément de stock ATOMIQUE (anti « lost update »)
--  ⚠️  À exécuter dans le Supabase PRINCIPAL de l'IWC (SQL Editor).
--  100 % additif · idempotent. Sans cette fonction, la caisse retombe sur un
--  décrément lecture/écriture (le site est tolérant) ; avec elle, deux ventes
--  simultanées du même produit ne s'écrasent plus (verrou de ligne).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION armurerie_stock_mouvement(p_id text, p_delta int)
RETURNS TABLE(avant int, apres int) LANGUAGE plpgsql AS $$
DECLARE av int; ap int;
BEGIN
  -- Verrou de ligne : sérialise les décréments concurrents sur le même produit.
  SELECT "stock" INTO av FROM "ArmurerieProduit" WHERE "id" = p_id FOR UPDATE;
  IF av IS NULL THEN RETURN; END IF;              -- produit inconnu → aucune ligne
  ap := GREATEST(0, av + p_delta);                -- jamais négatif
  UPDATE "ArmurerieProduit" SET "stock" = ap WHERE "id" = p_id;
  RETURN QUERY SELECT av, ap;
END; $$;
