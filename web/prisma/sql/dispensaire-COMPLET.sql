-- ═══════════════════════════════════════════════════════════════════════════
--  DISPENSAIRE DE SAINT-DENIS — SCHÉMA COMPLET (site autonome).
--  À exécuter UNE FOIS dans la base Supabase DÉDIÉE au dispensaire.
--  Rassemble toutes les tables du dispensaire. Additif & idempotent.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── RH / Salariés ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "DispensaireSalarie" (
  "id" TEXT PRIMARY KEY, "nom" TEXT NOT NULL, "grade" TEXT, "qualifications" TEXT,
  "dateEmbauche" DATE, "compteBancaire" TEXT, "telegramme" TEXT,
  "statut" TEXT NOT NULL DEFAULT 'actif', "absJustifiees" INTEGER NOT NULL DEFAULT 0,
  "absInjustifiees" INTEGER NOT NULL DEFAULT 0, "notes" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(), "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(), "updatedBy" TEXT
);
ALTER TABLE "DispensaireSalarie" ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS "DispensaireSalarie_nom_idx" ON "DispensaireSalarie" (lower("nom"));

-- ── Pointage ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "DispensairePointage" (
  "id" TEXT PRIMARY KEY, "salarieId" TEXT, "nom" TEXT NOT NULL,
  "debut" TIMESTAMPTZ NOT NULL DEFAULT now(), "fin" TIMESTAMPTZ, "dureeMin" INTEGER, "note" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(), "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(), "updatedBy" TEXT
);
ALTER TABLE "DispensairePointage" ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS "DispensairePointage_debut_idx" ON "DispensairePointage" ("debut" DESC);
CREATE INDEX IF NOT EXISTS "DispensairePointage_ouvert_idx" ON "DispensairePointage" ("salarieId") WHERE "fin" IS NULL;

-- ── Stockage + traçabilité ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "DispensaireStock" (
  "id" TEXT PRIMARY KEY, "nom" TEXT NOT NULL, "categorie" TEXT NOT NULL DEFAULT 'materiel',
  "coffre" TEXT, "unite" TEXT, "stock" INTEGER NOT NULL DEFAULT 0, "stockFixe" INTEGER NOT NULL DEFAULT 0,
  "seuil" INTEGER NOT NULL DEFAULT 0, "note" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(), "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(), "updatedBy" TEXT
);
ALTER TABLE "DispensaireStock" ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS "DispensaireStock_coffre_idx" ON "DispensaireStock" (lower(coalesce("coffre", '')));

CREATE TABLE IF NOT EXISTS "DispensaireStockMouvement" (
  "id" TEXT PRIMARY KEY, "stockId" TEXT, "nomItem" TEXT NOT NULL, "coffre" TEXT,
  "delta" INTEGER NOT NULL, "apres" INTEGER, "motif" TEXT, "par" TEXT, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE "DispensaireStockMouvement" ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS "DispensaireStockMouvement_date_idx" ON "DispensaireStockMouvement" ("createdAt" DESC);
CREATE INDEX IF NOT EXISTS "DispensaireStockMouvement_item_idx" ON "DispensaireStockMouvement" ("stockId");

-- ── Matières premières + Coffres ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "DispensaireMatiere" (
  "id" TEXT PRIMARY KEY, "nom" TEXT NOT NULL, "quantite" INTEGER NOT NULL DEFAULT 0,
  "seuil" INTEGER NOT NULL DEFAULT 0, "cible" INTEGER NOT NULL DEFAULT 0, "unite" TEXT, "fournisseur" TEXT, "note" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(), "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(), "updatedBy" TEXT
);
ALTER TABLE "DispensaireMatiere" ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS "DispensaireMatiere_nom_idx" ON "DispensaireMatiere" (lower("nom"));

CREATE TABLE IF NOT EXISTS "DispensaireCoffre" (
  "id" TEXT PRIMARY KEY, "nom" TEXT NOT NULL, "emplacement" TEXT, "responsable" TEXT, "note" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(), "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(), "updatedBy" TEXT
);
ALTER TABLE "DispensaireCoffre" ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS "DispensaireCoffre_nom_idx" ON "DispensaireCoffre" (lower("nom"));

-- ── Facturation : Ventes / Factures / Soins FDO / Notes de frais ───────────
CREATE TABLE IF NOT EXISTS "DispensaireVente" (
  "id" TEXT PRIMARY KEY, "patient" TEXT NOT NULL, "item" TEXT NOT NULL DEFAULT 'Bandage',
  "quantite" INTEGER NOT NULL DEFAULT 1, "prixUnitaire" INTEGER NOT NULL DEFAULT 4, "total" INTEGER NOT NULL DEFAULT 0,
  "note" TEXT, "par" TEXT, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE "DispensaireVente" ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS "DispensaireVente_date_idx" ON "DispensaireVente" ("createdAt" DESC);
CREATE INDEX IF NOT EXISTS "DispensaireVente_patient_idx" ON "DispensaireVente" (lower("patient"));

CREATE TABLE IF NOT EXISTS "DispensaireFacture" (
  "id" TEXT PRIMARY KEY, "objet" TEXT NOT NULL, "destinataire" TEXT, "montant" INTEGER NOT NULL DEFAULT 0,
  "dateEmission" DATE, "dateEcheance" DATE, "statut" TEXT NOT NULL DEFAULT 'non_payee', "note" TEXT, "par" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(), "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE "DispensaireFacture" ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS "DispensaireFacture_statut_idx" ON "DispensaireFacture" ("statut");
CREATE INDEX IF NOT EXISTS "DispensaireFacture_echeance_idx" ON "DispensaireFacture" ("dateEcheance");

CREATE TABLE IF NOT EXISTS "DispensaireSoinFDO" (
  "id" TEXT PRIMARY KEY, "bureau" TEXT NOT NULL, "agent" TEXT, "soin" TEXT, "montant" INTEGER NOT NULL DEFAULT 0,
  "statut" TEXT NOT NULL DEFAULT 'offert', "note" TEXT, "par" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(), "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE "DispensaireSoinFDO" ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS "DispensaireSoinFDO_bureau_idx" ON "DispensaireSoinFDO" (lower("bureau"));

CREATE TABLE IF NOT EXISTS "DispensaireFrais" (
  "id" TEXT PRIMARY KEY, "objet" TEXT NOT NULL, "montant" INTEGER NOT NULL DEFAULT 0, "demandeur" TEXT,
  "statut" TEXT NOT NULL DEFAULT 'en_attente', "validePar" TEXT, "note" TEXT, "par" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(), "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE "DispensaireFrais" ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS "DispensaireFrais_statut_idx" ON "DispensaireFrais" ("statut");

-- ── Certificats / Rapports / Documents ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS "DispensaireCertificat" (
  "id" TEXT PRIMARY KEY, "patient" TEXT NOT NULL, "type" TEXT NOT NULL DEFAULT 'aptitude', "medecin" TEXT,
  "dateActe" DATE, "dureeRepos" INTEGER NOT NULL DEFAULT 0, "contenu" TEXT, "note" TEXT, "par" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE "DispensaireCertificat" ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS "DispensaireCertificat_date_idx" ON "DispensaireCertificat" ("createdAt" DESC);
CREATE INDEX IF NOT EXISTS "DispensaireCertificat_patient_idx" ON "DispensaireCertificat" (lower("patient"));

CREATE TABLE IF NOT EXISTS "DispensaireRapport" (
  "id" TEXT PRIMARY KEY, "titre" TEXT NOT NULL, "categorie" TEXT, "patient" TEXT, "lien" TEXT, "auteur" TEXT, "note" TEXT, "par" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE "DispensaireRapport" ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS "DispensaireRapport_date_idx" ON "DispensaireRapport" ("createdAt" DESC);

CREATE TABLE IF NOT EXISTS "DispensaireDocument" (
  "id" TEXT PRIMARY KEY, "titre" TEXT NOT NULL, "categorie" TEXT, "type" TEXT NOT NULL DEFAULT 'lien', "url" TEXT, "note" TEXT, "par" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE "DispensaireDocument" ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS "DispensaireDocument_date_idx" ON "DispensaireDocument" ("createdAt" DESC);

-- ── Rôles & Configuration ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "DispensaireMembre" (
  "id" TEXT PRIMARY KEY, "identifiant" TEXT, "nom" TEXT NOT NULL, "role" TEXT NOT NULL DEFAULT 'stagiaire',
  "actif" BOOLEAN NOT NULL DEFAULT true, "note" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(), "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(), "updatedBy" TEXT
);
ALTER TABLE "DispensaireMembre" ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS "DispensaireMembre_ident_idx" ON "DispensaireMembre" (lower(coalesce("identifiant", '')));
CREATE INDEX IF NOT EXISTS "DispensaireMembre_nom_idx" ON "DispensaireMembre" (lower("nom"));

CREATE TABLE IF NOT EXISTS "DispensaireConfig" (
  "cle" TEXT PRIMARY KEY, "valeur" TEXT, "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(), "updatedBy" TEXT
);
ALTER TABLE "DispensaireConfig" ENABLE ROW LEVEL SECURITY;

-- ── Contacts / Répertoire (optionnel — si tu réactives l'onglet Répertoire) ─
CREATE TABLE IF NOT EXISTS "DispensaireCategorie" (
  "id" TEXT PRIMARY KEY, "nom" TEXT NOT NULL, "ordre" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE "DispensaireCategorie" ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS "DispensaireContact" (
  "id" TEXT PRIMARY KEY, "nom" TEXT NOT NULL, "categorie" TEXT, "relation" TEXT, "responsable" TEXT,
  "telegramme" TEXT, "compteBancaire" TEXT, "adresse" TEXT, "description" TEXT, "notes" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(), "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE "DispensaireContact" ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS "DispensaireContact_nom_idx" ON "DispensaireContact" (lower("nom"));
