-- ═══════════════════════════════════════════════════════════════
--  DISPENSAIRE DE SAINT-DENIS — Facturation (web-native).
--  4 registres : Ventes (bandages 10/sem/patient à $4), Factures en retard
--  (statuts + chefs only), Soins FDO (shérifs par bureau), Notes de frais
--  (validation chef/adjoint + virement).
--  À exécuter UNE FOIS dans Supabase. Additif & idempotent.
-- ═══════════════════════════════════════════════════════════════

-- 1) Ventes (bandages & consommables au comptoir)
CREATE TABLE IF NOT EXISTS "DispensaireVente" (
  "id"            TEXT PRIMARY KEY,
  "patient"       TEXT NOT NULL,
  "item"          TEXT NOT NULL DEFAULT 'Bandage',
  "quantite"      INTEGER NOT NULL DEFAULT 1,
  "prixUnitaire"  INTEGER NOT NULL DEFAULT 4,          -- $ / unité
  "total"         INTEGER NOT NULL DEFAULT 0,          -- quantite × prixUnitaire
  "note"          TEXT,
  "par"           TEXT,
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE "DispensaireVente" ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS "DispensaireVente_date_idx" ON "DispensaireVente" ("createdAt" DESC);
CREATE INDEX IF NOT EXISTS "DispensaireVente_patient_idx" ON "DispensaireVente" (lower("patient"));

-- 2) Factures (suivi des impayés — réservé aux chefs)
CREATE TABLE IF NOT EXISTS "DispensaireFacture" (
  "id"            TEXT PRIMARY KEY,
  "objet"         TEXT NOT NULL,
  "destinataire"  TEXT,
  "montant"       INTEGER NOT NULL DEFAULT 0,
  "dateEmission"  DATE,
  "dateEcheance"  DATE,
  "statut"        TEXT NOT NULL DEFAULT 'non_payee',   -- non_payee | payee | dossier_police | cloture
  "note"          TEXT,
  "par"           TEXT,
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"     TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE "DispensaireFacture" ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS "DispensaireFacture_statut_idx" ON "DispensaireFacture" ("statut");
CREATE INDEX IF NOT EXISTS "DispensaireFacture_echeance_idx" ON "DispensaireFacture" ("dateEcheance");

-- 3) Soins aux Forces de l'ordre (shérifs par bureau)
CREATE TABLE IF NOT EXISTS "DispensaireSoinFDO" (
  "id"         TEXT PRIMARY KEY,
  "bureau"     TEXT NOT NULL,                          -- bureau du shérif
  "agent"      TEXT,                                    -- nom de l'agent / shérif
  "soin"       TEXT,
  "montant"    INTEGER NOT NULL DEFAULT 0,
  "statut"     TEXT NOT NULL DEFAULT 'offert',          -- offert | facture | regle
  "note"       TEXT,
  "par"        TEXT,
  "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE "DispensaireSoinFDO" ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS "DispensaireSoinFDO_bureau_idx" ON "DispensaireSoinFDO" (lower("bureau"));

-- 4) Notes de frais (validation chef/adjoint + virement)
CREATE TABLE IF NOT EXISTS "DispensaireFrais" (
  "id"          TEXT PRIMARY KEY,
  "objet"       TEXT NOT NULL,
  "montant"     INTEGER NOT NULL DEFAULT 0,
  "demandeur"   TEXT,
  "statut"      TEXT NOT NULL DEFAULT 'en_attente',     -- en_attente | valide | refuse | vire
  "validePar"   TEXT,
  "note"        TEXT,
  "par"         TEXT,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"   TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE "DispensaireFrais" ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS "DispensaireFrais_statut_idx" ON "DispensaireFrais" ("statut");
