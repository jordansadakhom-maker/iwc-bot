-- ═══════════════════════════════════════════════════════════════════════════
--  ARMURERIE DE VAN HORN — SCHÉMA COMPLET (tout-en-un)
--  ---------------------------------------------------------------------------
--  Reprend, dans le bon ordre et avec les types finaux (centimes = numeric),
--  l'ensemble des tables de l'armurerie : fichier clients, registre des ventes,
--  contrats, coffre + journal (comptabilité), catalogue produits, ressources
--  & stock, carnet de commande, et le module ERP (employés, pointage, paies,
--  impôts, notes, tâches). Plus le registre d'armes « Arme » et la fonction de
--  mouvement de coffre ATOMIQUE.
--
--  À exécuter UNE FOIS dans Supabase → SQL Editor (fenêtre privée).
--  Additif & idempotent : CREATE IF NOT EXISTS + ADD COLUMN IF NOT EXISTS,
--  aucune donnée existante n'est perdue. La RLS est activée sur chaque table
--  (la clé publiable ne lit rien ; le site lit via la clé serveur).
--
--  Ces tables sont SITE-NATIVES : écrites directement par le site
--  (jamais réconciliées par le bot). Seule « Arme » est synchronisée par le bot.
-- ═══════════════════════════════════════════════════════════════════════════


-- ── Enum Pole (nécessaire à la table Arme ; créé s'il manque) ───────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'Pole') THEN
    CREATE TYPE "Pole" AS ENUM ('legal', 'illegal');
  END IF;
END $$;


-- ═══════════════════════════════ COMPTOIR ══════════════════════════════════

-- Fichier clients (avec rangement des cartes d'identité)
CREATE TABLE IF NOT EXISTS "ArmurerieClient" (
  "id"            TEXT PRIMARY KEY,
  "nom"           TEXT NOT NULL,
  "telegramme"    TEXT,
  "discordId"     TEXT,
  "carteIdentite" TEXT,                     -- URL Supabase Storage (photo de la CNI)
  "statut"        TEXT DEFAULT 'actif',     -- actif / interdit / surveillance
  "notes"         TEXT,
  "createdAt"     TIMESTAMPTZ DEFAULT now(),
  "updatedAt"     TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE "ArmurerieClient" ENABLE ROW LEVEL SECURITY;

-- Registre officiel des ventes (Décret N°2 — champs obligatoires Art. II)
CREATE TABLE IF NOT EXISTS "ArmurerieVente" (
  "id"           TEXT PRIMARY KEY,
  "clientId"     TEXT,
  "acquereur"    TEXT,        -- nom + prénom de l'acquéreur
  "dateVente"    TEXT,        -- date de la vente
  "marque"       TEXT,        -- marque
  "modele"       TEXT,        -- modèle
  "categorie"    TEXT,        -- type d'arme
  "numeroSerie"  TEXT,        -- n° de série gravé par le fabricant
  "vendeur"      TEXT,        -- armurier / employé ayant vendu
  "telegramme"   TEXT,        -- n° de télégramme du propriétaire
  "prix"         INTEGER DEFAULT 0,
  "quantite"     INTEGER,     -- qté de la ligne
  "prixUnitaire" NUMERIC,     -- prix unitaire de la ligne
  "ticket"       TEXT,        -- n° de facture commun aux lignes d'un même règlement
  "photo"        TEXT,        -- photo de l'acquéreur (URL)
  "notes"        TEXT,
  "statut"       TEXT DEFAULT 'enregistree',
  "createdAt"    TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE "ArmurerieVente" ENABLE ROW LEVEL SECURITY;

-- Contrats de vente (envoyés au client par le bot, à signer)
CREATE TABLE IF NOT EXISTS "ArmurerieContrat" (
  "id"              TEXT PRIMARY KEY,
  "clientId"        TEXT,
  "venteId"         TEXT,
  "clientNom"       TEXT,
  "clientDiscordId" TEXT,
  "arme"            TEXT,
  "numeroSerie"     TEXT,
  "prix"            INTEGER DEFAULT 0,
  "conditions"      TEXT,
  "statut"          TEXT DEFAULT 'brouillon',  -- brouillon / envoye / signe / refuse
  "envoyeAt"        TIMESTAMPTZ,
  "signeAt"         TIMESTAMPTZ,
  "createdAt"       TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE "ArmurerieContrat" ENABLE ROW LEVEL SECURITY;

-- Carnet de commande (bon de commande client)
CREATE TABLE IF NOT EXISTS "ArmurerieCommande" (
  "id"           TEXT PRIMARY KEY,
  "categorie"    TEXT,
  "clientNom"    TEXT,
  "clientPrenom" TEXT,
  "lignes"       JSONB DEFAULT '[]'::jsonb,   -- [{objet, qte, prixUnitaire}]
  "total"        numeric(14,2) DEFAULT 0,     -- cumul de toutes les lignes
  "statut"       TEXT DEFAULT 'en_attente',   -- en_attente / prete / livree / annulee
  "notes"        TEXT,
  "createdAt"    TIMESTAMPTZ DEFAULT now(),
  "updatedAt"    TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE "ArmurerieCommande" ENABLE ROW LEVEL SECURITY;


-- ══════════════════════════ COFFRE & COMPTABILITÉ ══════════════════════════

-- Coffre PROPRE à l'armurerie (séparé des coffres de la compagnie).
-- solde en numeric(14,2) → centimes conservés (ex. 803,20 $).
CREATE TABLE IF NOT EXISTS "ArmurerieCoffre" (
  "id"        TEXT PRIMARY KEY,              -- 'vanhorn'
  "solde"     numeric(14,2) DEFAULT 0,
  "updatedAt" TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE "ArmurerieCoffre" ENABLE ROW LEVEL SECURITY;

-- Journal du coffre (ventes, dépenses, dépôts/retraits).
-- nature : 'produit' (achat qui entre en stock) / 'charge' (frais) / NULL (recette).
CREATE TABLE IF NOT EXISTS "ArmurerieMouvementCoffre" (
  "id"        TEXT PRIMARY KEY,
  "sens"      TEXT,                          -- entree / sortie
  "montant"   numeric(14,2) DEFAULT 0,
  "motif"     TEXT,
  "auteur"    TEXT,
  "nature"    TEXT,
  "createdAt" TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE "ArmurerieMouvementCoffre" ENABLE ROW LEVEL SECURITY;


-- ═══════════════════════════ PRODUITS & RESSOURCES ═════════════════════════

-- Catalogue produits (Caisse / point de vente)
CREATE TABLE IF NOT EXISTS "ArmurerieProduit" (
  "id"         TEXT PRIMARY KEY,
  "nom"        TEXT NOT NULL,
  "categorie"  TEXT DEFAULT 'Divers',
  "prix"       INTEGER DEFAULT 0,            -- prix de vente
  "cout"       INTEGER DEFAULT 0,            -- coût matières
  "stock"      INTEGER DEFAULT 0,
  "niveau"     INTEGER DEFAULT 0,            -- niveau de craft requis
  "recette"    JSONB DEFAULT '[]'::jsonb,    -- [{ressourceId, qte}] ingrédients requis
  "aLaDemande" BOOLEAN DEFAULT false,
  "createdAt"  TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE "ArmurerieProduit" ENABLE ROW LEVEL SECURITY;

-- Ressources (matières premières nécessaires au craft) + stock
CREATE TABLE IF NOT EXISTS "ArmurerieRessource" (
  "id"        TEXT PRIMARY KEY,
  "nom"       TEXT NOT NULL,
  "categorie" TEXT DEFAULT 'Divers',
  "prix"      numeric(14,2) DEFAULT 0,       -- coût unitaire de la ressource
  "stock"     INTEGER DEFAULT 0,
  "mine"      BOOLEAN DEFAULT false,         -- vient de la mine → remise 5 % applicable
  "createdAt" TIMESTAMPTZ DEFAULT now(),
  "updatedAt" TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE "ArmurerieRessource" ENABLE ROW LEVEL SECURITY;


-- ═══════════════════════════════════ ERP ═══════════════════════════════════

-- Employés de l'armurerie (roster : pointage + paies)
CREATE TABLE IF NOT EXISTS "ArmurerieEmploye" (
  "id"          TEXT PRIMARY KEY,
  "nom"         TEXT NOT NULL,
  "discordId"   TEXT,
  "role"        TEXT DEFAULT 'Armurier',     -- Patron / Armurier / Apprenti…
  "commission"  INTEGER DEFAULT 0,           -- % du CA reversé en paie
  "salaireBase" INTEGER DEFAULT 0,           -- fixe par période
  "actif"       BOOLEAN DEFAULT true,
  "createdAt"   TIMESTAMPTZ DEFAULT now(),
  "updatedAt"   TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE "ArmurerieEmploye" ENABLE ROW LEVEL SECURITY;

-- Pointage (prise/fin de service — heures travaillées)
CREATE TABLE IF NOT EXISTS "ArmureriePointage" (
  "id"         TEXT PRIMARY KEY,
  "employeId"  TEXT,
  "employeNom" TEXT,
  "debut"      TIMESTAMPTZ,
  "fin"        TIMESTAMPTZ,
  "minutes"    INTEGER DEFAULT 0,
  "createdAt"  TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE "ArmureriePointage" ENABLE ROW LEVEL SECURITY;

-- Paies (commission sur CA + fixe + prime)
CREATE TABLE IF NOT EXISTS "ArmureriePaie" (
  "id"         TEXT PRIMARY KEY,
  "employeId"  TEXT,
  "employeNom" TEXT,
  "periode"    TEXT,
  "ventes"     INTEGER DEFAULT 0,            -- CA rattaché à l'employé
  "commission" INTEGER DEFAULT 0,
  "base"       INTEGER DEFAULT 0,
  "prime"      INTEGER DEFAULT 0,
  "montant"    INTEGER DEFAULT 0,            -- total versé
  "statut"     TEXT DEFAULT 'du',            -- du / paye
  "notes"      TEXT,
  "payeAt"     TIMESTAMPTZ,
  "createdAt"  TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE "ArmureriePaie" ENABLE ROW LEVEL SECURITY;

-- Impôts (CA de la période × taux → montant à régler)
CREATE TABLE IF NOT EXISTS "ArmurerieImpot" (
  "id"              TEXT PRIMARY KEY,
  "libelle"         TEXT,
  "debut"           TEXT,
  "fin"             TEXT,
  "chiffreAffaires" INTEGER DEFAULT 0,
  "taux"            INTEGER DEFAULT 0,        -- %
  "montant"         INTEGER DEFAULT 0,
  "statut"          TEXT DEFAULT 'du',        -- du / paye
  "payeAt"          TIMESTAMPTZ,
  "notes"           TEXT,
  "createdAt"       TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE "ArmurerieImpot" ENABLE ROW LEVEL SECURITY;

-- Bloc-notes partagé (mémos épinglables)
CREATE TABLE IF NOT EXISTS "ArmurerieNote" (
  "id"        TEXT PRIMARY KEY,
  "titre"     TEXT,
  "contenu"   TEXT,
  "epingle"   BOOLEAN DEFAULT false,
  "auteur"    TEXT,
  "createdAt" TIMESTAMPTZ DEFAULT now(),
  "updatedAt" TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE "ArmurerieNote" ENABLE ROW LEVEL SECURITY;

-- Tâches (check-list de l'atelier)
CREATE TABLE IF NOT EXISTS "ArmurerieTache" (
  "id"        TEXT PRIMARY KEY,
  "texte"     TEXT NOT NULL,
  "fait"      BOOLEAN DEFAULT false,
  "assigneA"  TEXT,
  "auteur"    TEXT,
  "createdAt" TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE "ArmurerieTache" ENABLE ROW LEVEL SECURITY;


-- ═══════════════════════ REGISTRE D'ARMES (bot-sync) ═══════════════════════
CREATE TABLE IF NOT EXISTS "Arme" (
  "id"           TEXT PRIMARY KEY,
  "serie"        TEXT NOT NULL,
  "type"         TEXT,
  "categorie"    TEXT,
  "appartenance" TEXT,
  "membreId"     TEXT,
  "membreNom"    TEXT,
  "notes"        TEXT,
  "pole"         "Pole",
  "createdAt"    TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE "Arme" ENABLE ROW LEVEL SECURITY;


-- ═════════════════════ FONCTION MOUVEMENT DE COFFRE (atomique) ═════════════
-- Met à jour le solde (jamais < 0) ET journalise le mouvement dans UNE seule
-- transaction, puis renvoie le nouveau solde. Empêche deux mouvements
-- simultanés de s'écraser.
CREATE OR REPLACE FUNCTION armurerie_coffre_mouvement(
  p_id      TEXT,
  p_montant NUMERIC,
  p_sens    TEXT,
  p_motif   TEXT,
  p_auteur  TEXT,
  p_nature  TEXT
) RETURNS NUMERIC
LANGUAGE plpgsql
AS $$
DECLARE
  v_delta NUMERIC := CASE WHEN p_sens = 'sortie' THEN -ABS(p_montant) ELSE ABS(p_montant) END;
  v_solde NUMERIC;
BEGIN
  INSERT INTO "ArmurerieCoffre" ("id", "solde", "updatedAt")
    VALUES ('vanhorn', 0, now())
    ON CONFLICT ("id") DO NOTHING;

  UPDATE "ArmurerieCoffre"
    SET "solde" = GREATEST(0, "solde" + v_delta), "updatedAt" = now()
    WHERE "id" = 'vanhorn'
    RETURNING "solde" INTO v_solde;

  INSERT INTO "ArmurerieMouvementCoffre" ("id", "sens", "montant", "motif", "auteur", "nature", "createdAt")
    VALUES (p_id, p_sens, ABS(p_montant), p_motif, p_auteur, p_nature, now());

  RETURN v_solde;
END;
$$;


-- ═══════════ RATTRAPAGE pour une base déjà installée (sans perte) ══════════
-- Ces lignes ne servent qu'aux bases créées AVANT ces colonnes/types ; sur une
-- base neuve elles ne font rien. Toutes idempotentes.
ALTER TABLE IF EXISTS "ArmurerieVente"           ADD COLUMN IF NOT EXISTS "quantite"     INTEGER;
ALTER TABLE IF EXISTS "ArmurerieVente"           ADD COLUMN IF NOT EXISTS "prixUnitaire" NUMERIC;
ALTER TABLE IF EXISTS "ArmurerieVente"           ADD COLUMN IF NOT EXISTS "ticket"       TEXT;
ALTER TABLE IF EXISTS "ArmurerieVente"           ADD COLUMN IF NOT EXISTS "photo"        TEXT;
ALTER TABLE IF EXISTS "ArmurerieProduit"         ADD COLUMN IF NOT EXISTS "niveau"       INTEGER DEFAULT 0;
ALTER TABLE IF EXISTS "ArmurerieProduit"         ADD COLUMN IF NOT EXISTS "recette"      JSONB DEFAULT '[]'::jsonb;
ALTER TABLE IF EXISTS "ArmurerieRessource"       ADD COLUMN IF NOT EXISTS "categorie"    TEXT DEFAULT 'Divers';
ALTER TABLE IF EXISTS "ArmurerieRessource"       ADD COLUMN IF NOT EXISTS "stock"        INTEGER DEFAULT 0;
ALTER TABLE IF EXISTS "ArmurerieRessource"       ADD COLUMN IF NOT EXISTS "mine"         BOOLEAN DEFAULT false;
ALTER TABLE IF EXISTS "ArmurerieMouvementCoffre" ADD COLUMN IF NOT EXISTS "nature"       TEXT;
-- Centimes : passe le coffre & les mouvements en numeric(14,2) si encore en INTEGER.
ALTER TABLE "ArmurerieCoffre"          ALTER COLUMN "solde"   TYPE numeric(14,2) USING "solde"::numeric;
ALTER TABLE "ArmurerieMouvementCoffre" ALTER COLUMN "montant" TYPE numeric(14,2) USING "montant"::numeric;
