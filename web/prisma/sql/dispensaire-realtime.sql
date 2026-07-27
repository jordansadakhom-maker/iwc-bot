-- ═══════════════════════════════════════════════════════════════════════════
--  TEMPS RÉEL DU DISPENSAIRE (Lot 7+) — à exécuter dans le Supabase du
--  DISPENSAIRE (projet séparé zcoqmc…). Additif & idempotent.
--
--  « DispensaireRealtimeSignal » = une table SIGNAL minuscule (une seule ligne,
--  juste un horodatage) que le serveur « pousse » à chaque événement métier. Le
--  navigateur s'y abonne (Supabase Realtime) et recharge la vue courante — les
--  DONNÉES, elles, restent lues côté serveur en service_role.
--
--  Elle est volontairement en LECTURE PUBLIQUE : elle ne contient aucune donnée
--  sensible (un « at »), c'est ce qui permet à Realtime de délivrer l'événement
--  au navigateur sans exposer les tables métier (qui, elles, restent fermées).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS "DispensaireRealtimeSignal" (
  "id" TEXT PRIMARY KEY,
  "at" TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO "DispensaireRealtimeSignal" ("id", "at") VALUES ('global', now())
  ON CONFLICT ("id") DO NOTHING;

ALTER TABLE "DispensaireRealtimeSignal" ENABLE ROW LEVEL SECURITY;

-- Lecture publique (horodatage uniquement) → Realtime peut délivrer l'événement.
DROP POLICY IF EXISTS "dispensaire_signal_read" ON "DispensaireRealtimeSignal";
CREATE POLICY "dispensaire_signal_read" ON "DispensaireRealtimeSignal" FOR SELECT USING (true);

-- Ajoute la table à la publication temps réel (idempotent : ignore si déjà membre).
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE "DispensaireRealtimeSignal";
EXCEPTION WHEN OTHERS THEN NULL;   -- déjà présente, ou publication absente
END $$;
