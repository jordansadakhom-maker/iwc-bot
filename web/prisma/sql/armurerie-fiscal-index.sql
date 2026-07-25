-- Index de performance pour la fiscalité de l'armurerie.
-- Le calcul du cycle balaie les mouvements de coffre (bénéfice = flux net) et
-- cherche la dernière déclaration réglée. Ces index gardent ça rapide quand le
-- volume grossit (des milliers de ventes / mouvements).
--
-- À lancer UNE FOIS dans Supabase → SQL Editor. Additif, idempotent, sans risque
-- (ne touche aucune donnée ; CREATE INDEX IF NOT EXISTS).

-- Mouvements de coffre : filtrés par date (>= début de cycle) et triés par date.
CREATE INDEX IF NOT EXISTS "ArmurerieMouvementCoffre_createdAt_idx"
  ON "ArmurerieMouvementCoffre" ("createdAt" DESC);

-- Déclarations d'impôt : recherche de la dernière RÉGLÉE (début du cycle) et de
-- la déclaration « du » en cours.
CREATE INDEX IF NOT EXISTS "ArmurerieImpot_statut_payeAt_idx"
  ON "ArmurerieImpot" ("statut", "payeAt" DESC);

CREATE INDEX IF NOT EXISTS "ArmurerieImpot_statut_createdAt_idx"
  ON "ArmurerieImpot" ("statut", "createdAt" DESC);
