-- ═══════════════════════════════════════════════════════════════════════════
--  NOTIFICATIONS — ciblage par RÔLE/GRADE (RLS) — étend notifications-ciblage.sql
--  Additif & idempotent. À exécuter dans le Supabase PRINCIPAL (IWC).
--
--  Ajoute le ciblage par rôle : une notification avec roleCible ('direction',
--  'officier', 'medecin', 'armurier') n'est reçue en temps réel que par les
--  membres qui portent ce rôle (déduit du grade + fiche RH, comme getAcces).
--
--  Récap des cas (policy ci-dessous) :
--    • membreId NULL ET roleCible NULL  → diffusion d'équipe, visible de tous
--    • membreId renseigné               → seulement ce membre
--    • roleCible renseigné              → seulement les porteurs du rôle
--
--  ZÉRO RÉGRESSION : toutes les notifications existantes ont membreId NULL ET
--  roleCible NULL → elles restent visibles de tous. Ce script remplace la policy
--  de notifications-ciblage.sql (il peut être exécuté même si celui-ci ne l'a pas
--  été : current_discord_id() est (re)créée ici).
--
--  Les lectures serveur (service_role) contournent la RLS et sont filtrées côté
--  code (lib/notif-ciblage) ; la RLS sécurise le canal temps réel du navigateur.
--
--  NB armurerie : le rôle 'armurier' est ici déduit du grade (~ 'armur') ; le
--  roster nominatif de l'armurerie n'est pris en compte que côté serveur.
--
--  ROLLBACK (revenir au ciblage membre seul) :
--    DROP POLICY IF EXISTS "Notification_select_cible" ON "Notification";
--    CREATE POLICY "Notification_select_cible" ON "Notification"
--      FOR SELECT TO authenticated
--      USING ("membreId" IS NULL OR "membreId" = public.current_discord_id());
-- ═══════════════════════════════════════════════════════════════════════════

-- Id Discord du membre connecté (idempotent : identique à notifications-ciblage.sql).
CREATE OR REPLACE FUNCTION public.current_discord_id() RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    auth.jwt() -> 'user_metadata' ->> 'provider_id',
    auth.jwt() -> 'user_metadata' ->> 'sub'
  );
$$;

-- Le membre connecté porte-t-il ce rôle ? (grade + fiche RH ; mêmes règles que getAcces)
CREATE OR REPLACE FUNCTION public.current_member_has_role(role text) RETURNS boolean
LANGUAGE plpgsql STABLE AS $$
DECLARE
  did text := public.current_discord_id();
  g text;
  fiche jsonb;
BEGIN
  IF did IS NULL THEN RETURN false; END IF;
  SELECT lower(coalesce("grade", '')), "ficheRH" INTO g, fiche FROM "Membre" WHERE "id" = did;
  IF NOT FOUND THEN RETURN false; END IF;
  RETURN CASE lower(coalesce(role, ''))
    WHEN 'direction' THEN g ~ 'fondateur|conseil|directeur|fl[eé]au|concepteur'
    WHEN 'officier'  THEN g ~ 'fondateur|conseil|directeur|fl[eé]au|concepteur|officier|instructeur'
    WHEN 'medecin'   THEN coalesce(nullif(fiche ->> 'medecin', '')::boolean, false)
    WHEN 'armurier'  THEN g ~ 'fondateur|conseil|directeur|fl[eé]au|concepteur|armur'
    ELSE false
  END;
EXCEPTION WHEN OTHERS THEN RETURN false;  -- fiche RH inattendue → jamais d'erreur bloquante
END; $$;

ALTER TABLE "Notification" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Notification_select_auth"  ON "Notification";
DROP POLICY IF EXISTS "Notification_select_cible" ON "Notification";
CREATE POLICY "Notification_select_cible" ON "Notification" FOR SELECT TO authenticated
USING (
  ("membreId" IS NULL AND "roleCible" IS NULL)                                  -- équipe
  OR "membreId" = public.current_discord_id()                                  -- ciblée membre
  OR ("roleCible" IS NOT NULL AND public.current_member_has_role("roleCible")) -- ciblée rôle
);
