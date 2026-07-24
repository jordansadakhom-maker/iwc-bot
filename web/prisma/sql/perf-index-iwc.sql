-- ═══════════════════════════════════════════════════════════════════════════
--  PERF — Index de l'IRON WOLF COMPANY (site principal)
--  À exécuter dans le Supabase IRON WOLF (celui alimenté par le bot Discord).
--
--  100 % additif & idempotent : chaque index est « IF NOT EXISTS », rien n'est
--  supprimé ni modifié. Rejouable sans risque. Toutes les colonnes ci-dessous
--  ont été vérifiées dans les schémas existants (init.sql, phase*.sql, etc.).
--
--  Les clés primaires (id) sont déjà indexées automatiquement : les lookups
--  Membre.id / Coffre.id à chaque requête sont donc déjà rapides. On ajoute ici
--  les colonnes de TRI (createdAt), de FILTRE (statut) et les CLÉS ÉTRANGÈRES
--  utilisées dans les listes et journaux qui grossissent avec le temps.
--
--  Note : sur une très grosse table, préférer « CREATE INDEX CONCURRENTLY »
--  (hors transaction) pour éviter tout verrou.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Trésorerie & facturation ────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "idx_transaction_createdat" ON "Transaction" ("createdAt");
CREATE INDEX IF NOT EXISTS "idx_facture_createdat"     ON "Facture"     ("createdAt");
CREATE INDEX IF NOT EXISTS "idx_contrat_statut"        ON "Contrat"     ("statut");

-- ── Renseignement / traques ─────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "idx_traque_statut"         ON "Traque"      ("statut");
CREATE INDEX IF NOT EXISTS "idx_rapportterrain_createdat" ON "RapportTerrain" ("createdAt");

-- ── Médical / sanctions (lookup par membre) ─────────────────────────────────
CREATE INDEX IF NOT EXISTS "idx_dossier_membreid"      ON "DossierMedical" ("membreId");
CREATE INDEX IF NOT EXISTS "idx_sanction_membreid"     ON "Sanction"       ("membreId");

-- ── Rendez-vous / télégrammes / recrutement ─────────────────────────────────
CREATE INDEX IF NOT EXISTS "idx_rdv_statut"            ON "Rdv"         ("statut");
CREATE INDEX IF NOT EXISTS "idx_rdv_clientid"          ON "Rdv"         ("clientId");
CREATE INDEX IF NOT EXISTS "idx_telegramme_createdat"  ON "Telegramme"  ("createdAt");
CREATE INDEX IF NOT EXISTS "idx_telegramme_statut"     ON "Telegramme"  ("statut");
CREATE INDEX IF NOT EXISTS "idx_candidature_createdat" ON "Candidature" ("createdAt");
CREATE INDEX IF NOT EXISTS "idx_candidature_statut"    ON "Candidature" ("statut");

-- ── Chasse / inventaire (mouvements, append-only) ───────────────────────────
CREATE INDEX IF NOT EXISTS "idx_chassemvt_createdat"   ON "ChasseMouvement"     ("createdAt");
CREATE INDEX IF NOT EXISTS "idx_chassemvt_zoneid"      ON "ChasseMouvement"     ("zoneId");
CREATE INDEX IF NOT EXISTS "idx_invmvt_createdat"      ON "InventaireMouvement" ("createdAt");

-- ── Armurerie (ventes, mouvements, paies — les plus volumineux) ─────────────
CREATE INDEX IF NOT EXISTS "idx_armvente_createdat"    ON "ArmurerieVente"          ("createdAt");
CREATE INDEX IF NOT EXISTS "idx_armvente_clientid"     ON "ArmurerieVente"          ("clientId");
CREATE INDEX IF NOT EXISTS "idx_armvente_ticket"       ON "ArmurerieVente"          ("ticket");
CREATE INDEX IF NOT EXISTS "idx_armmvtcoffre_createdat" ON "ArmurerieMouvementCoffre" ("createdAt");
CREATE INDEX IF NOT EXISTS "idx_armmvtstock_createdat" ON "ArmurerieMouvementStock" ("createdAt");
CREATE INDEX IF NOT EXISTS "idx_armmvtstock_refid"     ON "ArmurerieMouvementStock" ("refId");
CREATE INDEX IF NOT EXISTS "idx_armpaie_employeid"     ON "ArmureriePaie"           ("employeId");
CREATE INDEX IF NOT EXISTS "idx_armpointage_employeid" ON "ArmureriePointage"       ("employeId");
CREATE INDEX IF NOT EXISTS "idx_armimpot_statut"       ON "ArmurerieImpot"          ("statut");
