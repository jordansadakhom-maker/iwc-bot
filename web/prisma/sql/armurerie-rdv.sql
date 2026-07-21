-- ═══════════════════════════════════════════════════════════════
--  ARMURERIE — PRISE DE RENDEZ-VOUS (agenda du comptoir de Van Horn).
--  À exécuter UNE FOIS dans Supabase → SQL Editor. Additif & idempotent.
--  Table NEUVE (site-native, jamais réconciliée par le bot). Le bot lit
--  seulement les RDV « à venir » pour envoyer les rappels 45 min / 15 min
--  avant l'heure dans #agenda.
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS "ArmurerieRdv" (
  "id"            TEXT PRIMARY KEY,
  "clientPrenom"  TEXT,
  "clientNom"     TEXT,
  "telegramme"    TEXT,                       -- moyen de contact du client
  "carteIdentite" TEXT,                       -- URL de la photo de pièce d'identité
  "commande"      TEXT,                       -- ce que le client vient chercher / commander
  "lieu"          TEXT,
  "dateRdv"       TIMESTAMPTZ,                 -- date + heure du rendez-vous
  "notes"         TEXT,
  "statut"        TEXT DEFAULT 'a_venir',      -- a_venir / honore / annule
  "rappel45"      BOOLEAN DEFAULT false,       -- rappel « 45 min avant » déjà envoyé ?
  "rappel15"      BOOLEAN DEFAULT false,       -- rappel « 15 min avant » déjà envoyé ?
  "createdAt"     TIMESTAMPTZ DEFAULT now(),
  "updatedAt"     TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE "ArmurerieRdv" ENABLE ROW LEVEL SECURITY;
