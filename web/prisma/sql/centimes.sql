-- ═══════════════════════════════════════════════════════════════
--  CENTIMES — passe les montants de INTEGER à numeric(14,2) pour
--  gérer 2 décimales (ex : 12,50$). À exécuter UNE FOIS dans Supabase
--  → SQL Editor. Idempotent & sans risque : élargir le type ne perd
--  aucune donnée (les entiers restent des entiers). « IF EXISTS » :
--  les tables absentes sont simplement ignorées.
-- ═══════════════════════════════════════════════════════════════

-- Coffres de la compagnie
ALTER TABLE IF EXISTS "Coffre" ALTER COLUMN "solde" TYPE numeric(14,2);

-- Armurerie — comptoir
ALTER TABLE IF EXISTS "ArmurerieProduit"        ALTER COLUMN "prix"    TYPE numeric(14,2);
ALTER TABLE IF EXISTS "ArmurerieProduit"        ALTER COLUMN "cout"    TYPE numeric(14,2);
ALTER TABLE IF EXISTS "ArmurerieVente"          ALTER COLUMN "prix"    TYPE numeric(14,2);
ALTER TABLE IF EXISTS "ArmurerieContrat"        ALTER COLUMN "prix"    TYPE numeric(14,2);
ALTER TABLE IF EXISTS "ArmurerieCoffre"         ALTER COLUMN "solde"   TYPE numeric(14,2);
ALTER TABLE IF EXISTS "ArmurerieMouvementCoffre" ALTER COLUMN "montant" TYPE numeric(14,2);

-- Armurerie — ERP
ALTER TABLE IF EXISTS "ArmurerieEmploye" ALTER COLUMN "salaireBase"    TYPE numeric(14,2);
ALTER TABLE IF EXISTS "ArmureriePaie"    ALTER COLUMN "ventes"         TYPE numeric(14,2);
ALTER TABLE IF EXISTS "ArmureriePaie"    ALTER COLUMN "commission"     TYPE numeric(14,2);
ALTER TABLE IF EXISTS "ArmureriePaie"    ALTER COLUMN "base"           TYPE numeric(14,2);
ALTER TABLE IF EXISTS "ArmureriePaie"    ALTER COLUMN "prime"          TYPE numeric(14,2);
ALTER TABLE IF EXISTS "ArmureriePaie"    ALTER COLUMN "montant"        TYPE numeric(14,2);
ALTER TABLE IF EXISTS "ArmurerieImpot"   ALTER COLUMN "chiffreAffaires" TYPE numeric(14,2);
ALTER TABLE IF EXISTS "ArmurerieImpot"   ALTER COLUMN "montant"        TYPE numeric(14,2);
