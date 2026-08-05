-- ═══════════════════════════════════════════════════════════════
--  APPROVISIONNEMENTS — seuils de commande & carnet de fournisseurs du
--  Dispensaire de Saint-Denis. Vue opérationnelle centralisant, pour chaque
--  article à réapprovisionner : le stock, le seuil, la date prévue de commande
--  et le statut (à commander / urgente / déjà passée / à récupérer) ; et, à part,
--  les coordonnées des fournisseurs (distillerie, tonnellerie, mine, menuisier,
--  cheminots…). Tables site-native (jamais réconciliées par le bot).
--  À exécuter UNE FOIS dans Supabase → SQL Editor. Additif & idempotent.
-- ═══════════════════════════════════════════════════════════════

-- 1) Lignes d'approvisionnement (seuils de commande).
CREATE TABLE IF NOT EXISTS "DispensaireApprovisionnement" (
  "id"          TEXT PRIMARY KEY,
  "article"     TEXT NOT NULL,                              -- ce qu'il faut commander
  "categorie"   TEXT,                                       -- ex. « Distillerie », « Mine »
  "fournisseur" TEXT,                                       -- nom du fournisseur associé
  "stock"       DOUBLE PRECISION NOT NULL DEFAULT 0,        -- quantité en stock
  "seuil"       DOUBLE PRECISION NOT NULL DEFAULT 0,        -- seuil de réapprovisionnement
  "unite"       TEXT,                                       -- ex. « caisses », « sacs »
  "datePrevue"  TIMESTAMPTZ,                                -- date prévue de commande
  "statut"      TEXT NOT NULL DEFAULT 'a_commander',        -- a_commander|urgente|passee|a_recuperer
  "note"        TEXT,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"   TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE "DispensaireApprovisionnement" ENABLE ROW LEVEL SECURITY;

-- 2) Carnet des fournisseurs (coordonnées).
CREATE TABLE IF NOT EXISTS "DispensaireFournisseur" (
  "id"         TEXT PRIMARY KEY,
  "nom"        TEXT NOT NULL,
  "categorie"  TEXT,                                        -- ex. « Distillerie »
  "contact"    TEXT,                                        -- personne / téléphone / canal
  "lieu"       TEXT,                                        -- où le trouver
  "note"       TEXT,
  "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE "DispensaireFournisseur" ENABLE ROW LEVEL SECURITY;

-- Sécurité : RLS activée sans politique publique → seule la clé service_role
-- (actions serveur du site) peut lire/écrire.
