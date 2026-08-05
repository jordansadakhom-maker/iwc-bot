-- ═══════════════════════════════════════════════════════════════
--  COMPTABILITÉ — écritures MANUELLES du Dispensaire de Saint-Denis.
--  La comptabilité reste reconstruite automatiquement à partir des flux réels
--  (factures encaissées, ventes, soins FDO réglés, notes de frais). Cette table
--  vient S'AJOUTER à ce grand-livre dérivé : elle permet à la Direction (et au
--  directeur adjoint) de saisir À LA MAIN une écriture — date, libellé,
--  catégorie, montant, type (recette / dépense) — à tout moment, et d'y verser
--  notamment les factures RÉGLÉES EN JEU par les joueurs (encaissements non
--  captés automatiquement par le site).
--  Table site-native (jamais réconciliée par le bot).
--  À exécuter UNE FOIS dans Supabase → SQL Editor. Additif & idempotent.
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS "DispensaireEcritureManuelle" (
  "id"         TEXT PRIMARY KEY,
  "date"       TIMESTAMPTZ NOT NULL DEFAULT now(),          -- date de l'écriture
  "libelle"    TEXT NOT NULL,                               -- description libre
  "categorie"  TEXT,                                        -- ex. « Facture (en jeu) », « Divers »
  "montant"    DOUBLE PRECISION NOT NULL DEFAULT 0,         -- montant en $
  "type"       TEXT NOT NULL DEFAULT 'recette',             -- 'recette' | 'depense'
  "note"       TEXT,
  "par"        TEXT,                                        -- auteur de la saisie
  "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Sécurité : RLS activée sans politique publique → seule la clé service_role
-- (actions serveur du site) peut lire/écrire.
ALTER TABLE "DispensaireEcritureManuelle" ENABLE ROW LEVEL SECURITY;
