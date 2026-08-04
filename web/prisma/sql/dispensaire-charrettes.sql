-- ═══════════════════════════════════════════════════════════════
--  CHARRETTES — suivi du matériel roulant du Dispensaire de Saint-Denis.
--  Qui détient chaque charrette, depuis quand (date de réception), qui en a
--  besoin et quand (« besoins »), et l'historique des détenteurs successifs
--  (« historique » → qui l'avait en dernier). Table site-native (jamais
--  réconciliée par le bot). À exécuter UNE FOIS dans Supabase → SQL Editor.
--  Additif & idempotent.
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS "DispensaireCharrette" (
  "id"             TEXT PRIMARY KEY,
  "nom"            TEXT NOT NULL,
  "detenteur"      TEXT,                                   -- détenteur actuel (NULL = disponible)
  "dateReception"  TIMESTAMPTZ,                            -- date de réception par le détenteur actuel
  "note"           TEXT,
  "besoins"        JSONB NOT NULL DEFAULT '[]'::jsonb,     -- [{ id, nom, quand, par, at }]
  "historique"     JSONB NOT NULL DEFAULT '[]'::jsonb,     -- [{ detenteur, dateReception, dateRetour, par }]
  "createdAt"      TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Sécurité : RLS activée sans politique publique → seule la clé service_role
-- (actions serveur du site) peut lire/écrire.
ALTER TABLE "DispensaireCharrette" ENABLE ROW LEVEL SECURITY;
