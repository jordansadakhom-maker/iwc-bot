-- ═══════════════════════════════════════════════════════════════
--  ARMURERIE DE VAN HORN — comptoir : fichier clients (+ cartes
--  d'identité), registre officiel des ventes (Décret N°2 de Louisiane)
--  et contrats de vente. À exécuter UNE FOIS dans Supabase → SQL Editor
--  (fenêtre privée). Additif & idempotent. Tables NEUVES (jamais
--  réconciliées par le bot → écrites directement par le site).
-- ═══════════════════════════════════════════════════════════════

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
  "id"          TEXT PRIMARY KEY,
  "clientId"    TEXT,
  "acquereur"   TEXT,       -- nom + prénom de l'acquéreur
  "dateVente"   TEXT,       -- date de la vente
  "marque"      TEXT,       -- marque
  "modele"      TEXT,       -- modèle
  "categorie"   TEXT,       -- type d'arme
  "numeroSerie" TEXT,       -- n° de série gravé par le fabricant
  "vendeur"     TEXT,       -- armurier / employé ayant vendu
  "telegramme"  TEXT,       -- n° de télégramme du propriétaire
  "prix"        INTEGER DEFAULT 0,
  "notes"       TEXT,
  "statut"      TEXT DEFAULT 'enregistree',
  "createdAt"   TIMESTAMPTZ DEFAULT now()
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
