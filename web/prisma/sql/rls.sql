-- ═══════════════════════════════════════════════════════════════
--  Sécurité RLS (Row Level Security) — plateforme web IWC — OPTIONNEL
--
--  ⚠️ NON OBLIGATOIRE. La RLS est DÉJÀ active sur ta base : la clé publiable ne
--  peut rien lire, et le site lit via la clé serveur (service_role). Ta base est
--  donc déjà protégée sans exécuter ce fichier.
--
--  Ce script sert UNIQUEMENT si tu veux, plus tard, que le site lise via la
--  session de chaque membre connecté (rôle « authenticated ») plutôt que via la
--  clé serveur. Il l'exécuter ne casse rien (le bot service_role ignore la RLS).
--
--  Effet :
--   • RLS (ré)activée sur toutes les tables (idempotent).
--   • Les membres CONNECTÉS (rôle « authenticated ») peuvent LIRE les données.
--   • Le bot (clé service_role) IGNORE la RLS → il continue d'écrire.
--
--  Base de départ simple : tout membre connecté peut tout lire. À affiner plus
--  tard (lecture par pôle / par grade). Aucune police d'écriture n'est créée :
--  le site reste en lecture seule.
-- ═══════════════════════════════════════════════════════════════

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'Membre','Role','MembreRole','Coffre','Transaction','Facture','Contrat',
    'Operation','Traque','RapportInfo','Contact','DossierMedical','Rdv',
    'Vehicule','Candidature','Sanction','Notification','JournalAudit'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I;', 'auth_read_' || t, t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR SELECT TO authenticated USING (true);',
      'auth_read_' || t, t
    );
  END LOOP;
END $$;

-- Vérification (optionnel) : liste les tables et leur état RLS.
-- SELECT relname, relrowsecurity FROM pg_class
--   WHERE relnamespace = 'public'::regnamespace AND relkind = 'r'
--   ORDER BY relname;
