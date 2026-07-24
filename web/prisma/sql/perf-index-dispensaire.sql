-- ═══════════════════════════════════════════════════════════════════════════
--  PERF — Index du DISPENSAIRE de Saint-Denis
--  À exécuter dans le Supabase du DISPENSAIRE (projet séparé).
--
--  100 % additif & idempotent : chaque index est « IF NOT EXISTS », rien n'est
--  supprimé ni modifié. Rejouable sans risque. Toutes les colonnes ci-dessous
--  ont été vérifiées dans les schémas existants.
--
--  Pourquoi : les listes/registres trient par date (createdAt) et les recherches
--  de service filtrent par identité/statut/clé étrangère. Un index évite le
--  balayage complet de la table à chaque affichage — surtout sur les tables qui
--  grossissent (ventes, mouvements, main courante).
--
--  Note : sur une très grosse table, remplacer « CREATE INDEX » par
--  « CREATE INDEX CONCURRENTLY » (à lancer alors HORS transaction) pour éviter
--  tout verrou. Ici les volumes sont modestes → un CREATE INDEX simple suffit.
-- ═══════════════════════════════════════════════════════════════════════════

-- Rôle du compte à CHAQUE requête (getRoleDispensaire → .eq("identifiant", …)).
CREATE INDEX IF NOT EXISTS "idx_dispmembre_identifiant" ON "DispensaireMembre" ("identifiant");

-- Registres triés par date (les plus récents en tête).
CREATE INDEX IF NOT EXISTS "idx_dispvente_createdat"    ON "DispensaireVente"          ("createdAt");
CREATE INDEX IF NOT EXISTS "idx_dispcert_createdat"     ON "DispensaireCertificat"     ("createdAt");
CREATE INDEX IF NOT EXISTS "idx_disprapport_createdat"  ON "DispensaireRapport"        ("createdAt");
CREATE INDEX IF NOT EXISTS "idx_dispfdo_createdat"      ON "DispensaireSoinFDO"        ("createdAt");
CREATE INDEX IF NOT EXISTS "idx_disphisto_createdat"    ON "DispensaireHistorique"     ("createdAt");
CREATE INDEX IF NOT EXISTS "idx_dispstockmvt_createdat" ON "DispensaireStockMouvement" ("createdAt");
CREATE INDEX IF NOT EXISTS "idx_disppointage_createdat" ON "DispensairePointage"       ("createdAt");

-- Filtres / clés étrangères fréquents.
CREATE INDEX IF NOT EXISTS "idx_dispfacture_statut"     ON "DispensaireFacture"        ("statut");
CREATE INDEX IF NOT EXISTS "idx_dispfacture_echeance"   ON "DispensaireFacture"        ("dateEcheance");
CREATE INDEX IF NOT EXISTS "idx_dispfacturelog_facture" ON "DispensaireFactureLog"     ("factureId");
CREATE INDEX IF NOT EXISTS "idx_dispfdo_statut"         ON "DispensaireSoinFDO"        ("statut");
CREATE INDEX IF NOT EXISTS "idx_dispfrais_statut"       ON "DispensaireFrais"          ("statut");
CREATE INDEX IF NOT EXISTS "idx_dispstockmvt_stockid"   ON "DispensaireStockMouvement" ("stockId");
CREATE INDEX IF NOT EXISTS "idx_disppointage_salarie"   ON "DispensairePointage"       ("salarieId");
