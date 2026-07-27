-- ═══════════════════════════════════════════════════════════════════════════
--  NOTIFICATIONS — ciblage par membre + RLS resserrée (temps réel navigateur)
--  Additif & idempotent. À exécuter dans le Supabase PRINCIPAL (IWC).
--
--  AVANT : policy "Notification_select_auth" USING (true) → tout membre connecté
--  reçoit en temps réel TOUTES les notifications (y compris celles ciblées).
--  APRÈS : une notification d'équipe (membreId NULL) reste visible de tous ; une
--  notification adressée à un membre précis (membreId renseigné) n'est reçue que
--  par lui.
--
--  ZÉRO RÉGRESSION : toutes les notifications existantes ont membreId NULL
--  (diffusions d'équipe) → elles restent visibles de tous. Seules les futures
--  notifications ciblées sont restreintes. Les lectures serveur (service_role)
--  contournent la RLS et sont déjà filtrées côté code (notifications/actions.ts,
--  getAlertes) : la RLS ici ne fait que sécuriser le canal temps réel du
--  navigateur (défense en profondeur).
--
--  ROLLBACK (revenir à l'état d'avant) :
--    DROP POLICY IF EXISTS "Notification_select_cible" ON "Notification";
--    CREATE POLICY "Notification_select_auth" ON "Notification"
--      FOR SELECT TO authenticated USING (true);
-- ═══════════════════════════════════════════════════════════════════════════

-- Id Discord du membre connecté, extrait du JWT (mêmes clés que le code :
-- user_metadata.provider_id puis .sub). STABLE : évaluée une fois par requête.
CREATE OR REPLACE FUNCTION public.current_discord_id() RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    auth.jwt() -> 'user_metadata' ->> 'provider_id',
    auth.jwt() -> 'user_metadata' ->> 'sub'
  );
$$;

ALTER TABLE "Notification" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Notification_select_auth"  ON "Notification";
DROP POLICY IF EXISTS "Notification_select_cible" ON "Notification";
CREATE POLICY "Notification_select_cible" ON "Notification" FOR SELECT TO authenticated
USING (
  "membreId" IS NULL                              -- diffusion d'équipe → tout le monde
  OR "membreId" = public.current_discord_id()     -- ciblée → seulement le destinataire
);
