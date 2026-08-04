-- ═══════════════════════════════════════════════════════════════
--  SOINS FDO — statut des RAPPORTS hebdomadaires (remboursement État).
--  Une ligne par semaine (clé « AAAA-MM-Sn », ex : 2026-08-S2). Porte le
--  statut de la demande de remboursement + les horodatages d'envoi/génération.
--  Table site-native (jamais réconciliée par le bot). À exécuter UNE FOIS
--  dans Supabase → SQL Editor. Additif & idempotent.
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS "DispensaireFdoRapport" (
  "id"        TEXT PRIMARY KEY,                    -- clé de semaine : AAAA-MM-Sn
  "statut"    TEXT NOT NULL DEFAULT 'en_attente',  -- en_attente | envoye | paye | refuse
  "envoyeLe"  TIMESTAMPTZ,                          -- date d'envoi à l'État
  "genereLe"  TIMESTAMPTZ,                          -- date de génération du rapport
  "note"      TEXT,
  "par"       TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Sécurité : RLS activée sans politique publique → seule la clé service_role
-- (actions serveur du site) peut lire/écrire.
ALTER TABLE "DispensaireFdoRapport" ENABLE ROW LEVEL SECURITY;
