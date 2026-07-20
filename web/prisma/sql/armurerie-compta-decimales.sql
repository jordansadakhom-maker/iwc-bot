-- ═══════════════════════════════════════════════════════════════
--  ARMURERIE — Comptabilité aux centimes près.
--  Passe le solde du coffre et le montant des mouvements de INTEGER
--  à NUMERIC(14,2) pour conserver les centimes (ex. 803,20 $ au lieu
--  de 803 $). À exécuter UNE FOIS dans Supabase → SQL Editor.
--  Sûr & idempotent : conserve les valeurs existantes.
-- ═══════════════════════════════════════════════════════════════
ALTER TABLE "ArmurerieCoffre"          ALTER COLUMN "solde"   TYPE numeric(14,2) USING "solde"::numeric;
ALTER TABLE "ArmurerieMouvementCoffre" ALTER COLUMN "montant" TYPE numeric(14,2) USING "montant"::numeric;
