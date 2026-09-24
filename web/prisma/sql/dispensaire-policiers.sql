-- ═══════════════════════════════════════════════════════════════════════════
--  DISPENSAIRE — Policiers (FDO) : carnet des forces de l'ordre soignées.
--  Permet d'enregistrer les policiers À LA MAIN une fois, puis de les
--  sélectionner dans un menu déroulant (trié par nom) lors de la saisie d'un
--  soin FDO — au lieu de retaper le nom à chaque fois. Le `bureau` (facultatif)
--  se pré-remplit automatiquement quand on choisit le policier.
--  Table site-native (jamais réconciliée par le bot).
--  À exécuter UNE FOIS dans Supabase → SQL Editor. Additif & idempotent.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS "DispensairePolicier" (
  "id"        TEXT PRIMARY KEY,
  "nom"       TEXT NOT NULL,
  "bureau"    TEXT,                                   -- bureau de rattachement (facultatif)
  "matricule" TEXT,                                   -- facultatif
  "note"      TEXT,
  "actif"     BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ,
  "updatedBy" TEXT
);
CREATE INDEX IF NOT EXISTS "DispPolicier_nom_idx" ON "DispensairePolicier"("nom");

-- Sécurité : RLS activée sans politique publique → seule la clé service_role
-- (actions serveur du site) peut lire/écrire.
ALTER TABLE "DispensairePolicier" ENABLE ROW LEVEL SECURITY;
