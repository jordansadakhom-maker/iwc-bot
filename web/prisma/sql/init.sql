-- CreateEnum
CREATE TYPE "Pole" AS ENUM ('legal', 'illegal', 'both');

-- CreateEnum
CREATE TYPE "StatutMembre" AS ENUM ('actif', 'absent', 'inactif', 'parti', 'visiteur');

-- CreateEnum
CREATE TYPE "PhaseOperation" AS ENUM ('preparation', 'en_cours', 'terminee', 'annulee');

-- CreateEnum
CREATE TYPE "SensTransaction" AS ENUM ('entree', 'sortie');

-- CreateTable
CREATE TABLE "Membre" (
    "id" TEXT NOT NULL,
    "nomIC" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "pole" "Pole" NOT NULL DEFAULT 'both',
    "grade" TEXT,
    "statut" "StatutMembre" NOT NULL DEFAULT 'actif',
    "ancienneteAt" TIMESTAMP(3),
    "parrainId" TEXT,
    "prefsNotif" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Membre_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MembreRole" (
    "membreId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,

    CONSTRAINT "MembreRole_pkey" PRIMARY KEY ("membreId","roleId")
);

-- CreateTable
CREATE TABLE "Coffre" (
    "id" TEXT NOT NULL,
    "pole" "Pole" NOT NULL,
    "solde" INTEGER NOT NULL DEFAULT 0,
    "seuilAlerte" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Coffre_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "coffreId" TEXT NOT NULL,
    "sens" "SensTransaction" NOT NULL,
    "montant" INTEGER NOT NULL,
    "motif" TEXT,
    "auteurId" TEXT,
    "pole" "Pole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Facture" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "clientNom" TEXT,
    "montant" INTEGER NOT NULL,
    "reglee" BOOLEAN NOT NULL DEFAULT false,
    "contratId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Facture_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contrat" (
    "id" TEXT NOT NULL,
    "cible" TEXT NOT NULL,
    "motif" TEXT,
    "remuneration" TEXT,
    "statut" TEXT NOT NULL DEFAULT 'en_attente',
    "pole" "Pole" NOT NULL,
    "commanditaire" TEXT,
    "agents" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Contrat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Operation" (
    "id" TEXT NOT NULL,
    "categorie" TEXT NOT NULL,
    "cible" TEXT NOT NULL,
    "phase" "PhaseOperation" NOT NULL DEFAULT 'preparation',
    "prime" TEXT,
    "contratId" TEXT,
    "createurId" TEXT,
    "agentsAssignes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "etapes" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Operation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Traque" (
    "id" TEXT NOT NULL,
    "cible" TEXT NOT NULL,
    "prime" TEXT,
    "dangerosite" TEXT,
    "statut" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Traque_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RapportInfo" (
    "id" TEXT NOT NULL,
    "source" TEXT,
    "cible" TEXT,
    "info" TEXT NOT NULL,
    "fiabilite" INTEGER NOT NULL DEFAULT 0,
    "statut" TEXT NOT NULL DEFAULT 'nouveau',
    "rapporteurId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RapportInfo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'Neutre',
    "fiabilite" INTEGER NOT NULL DEFAULT 0,
    "secteur" TEXT,
    "notes" TEXT,
    "photoUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DossierMedical" (
    "id" TEXT NOT NULL,
    "membreId" TEXT NOT NULL,
    "statut" TEXT NOT NULL DEFAULT 'non_teste',
    "blessures" JSONB,
    "suivis" JSONB,
    "ordonnances" JSONB,
    "historique" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DossierMedical_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rdv" (
    "id" TEXT NOT NULL,
    "clientId" TEXT,
    "nomRP" TEXT,
    "type" TEXT,
    "lieu" TEXT,
    "creneau" TEXT,
    "statut" TEXT NOT NULL DEFAULT 'Planifié',
    "agentId" TEXT,
    "paiement" JSONB,
    "satisfaction" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Rdv_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vehicule" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "type" TEXT,
    "pole" "Pole" NOT NULL,
    "etat" TEXT DEFAULT 'disponible',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Vehicule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Candidature" (
    "id" TEXT NOT NULL,
    "nomRP" TEXT NOT NULL,
    "pole" "Pole" NOT NULL,
    "statut" TEXT NOT NULL DEFAULT 'en_attente',
    "contenu" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Candidature_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sanction" (
    "id" TEXT NOT NULL,
    "membreId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "motif" TEXT,
    "parId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Sanction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "membreId" TEXT,
    "roleCible" TEXT,
    "pole" "Pole",
    "type" TEXT NOT NULL,
    "titre" TEXT NOT NULL,
    "corps" TEXT,
    "lien" TEXT,
    "lu" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalAudit" (
    "id" TEXT NOT NULL,
    "acteurId" TEXT,
    "action" TEXT NOT NULL,
    "cible" TEXT,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JournalAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Coffre_pole_key" ON "Coffre"("pole");

-- CreateIndex
CREATE UNIQUE INDEX "Facture_reference_key" ON "Facture"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "Operation_contratId_key" ON "Operation"("contratId");

-- CreateIndex
CREATE UNIQUE INDEX "DossierMedical_membreId_key" ON "DossierMedical"("membreId");

-- CreateIndex
CREATE INDEX "Notification_membreId_lu_idx" ON "Notification"("membreId", "lu");

-- CreateIndex
CREATE INDEX "Notification_roleCible_idx" ON "Notification"("roleCible");

-- CreateIndex
CREATE INDEX "JournalAudit_createdAt_idx" ON "JournalAudit"("createdAt");

-- AddForeignKey
ALTER TABLE "Membre" ADD CONSTRAINT "Membre_parrainId_fkey" FOREIGN KEY ("parrainId") REFERENCES "Membre"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembreRole" ADD CONSTRAINT "MembreRole_membreId_fkey" FOREIGN KEY ("membreId") REFERENCES "Membre"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembreRole" ADD CONSTRAINT "MembreRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_coffreId_fkey" FOREIGN KEY ("coffreId") REFERENCES "Coffre"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_auteurId_fkey" FOREIGN KEY ("auteurId") REFERENCES "Membre"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Operation" ADD CONSTRAINT "Operation_contratId_fkey" FOREIGN KEY ("contratId") REFERENCES "Contrat"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Operation" ADD CONSTRAINT "Operation_createurId_fkey" FOREIGN KEY ("createurId") REFERENCES "Membre"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_membreId_fkey" FOREIGN KEY ("membreId") REFERENCES "Membre"("id") ON DELETE SET NULL ON UPDATE CASCADE;

