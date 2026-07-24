-- ═══════════════════════════════════════════════════════════════════════════
--  PERF — Index du DISPENSAIRE de Saint-Denis
--  À exécuter dans le Supabase du DISPENSAIRE (projet séparé).
--
--  100 % additif, idempotent & TOLÉRANT : chaque index n'est créé que si sa
--  table ET sa colonne existent réellement dans ta base. Une table absente
--  (module non déployé) est simplement ignorée — le script ne s'arrête jamais
--  en erreur. Rejouable autant de fois que voulu.
--
--  Pourquoi : les listes/registres trient par date (createdAt) et les recherches
--  filtrent par identité/statut/clé étrangère. Un index évite le balayage
--  complet de la table à chaque affichage, surtout sur les tables qui grossissent.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  defs text[][] := ARRAY[
    -- [ table , colonne , nom de l'index ]
    ARRAY['DispensaireMembre',       'identifiant', 'idx_dispmembre_identifiant'],
    ARRAY['DispensaireVente',        'createdAt',   'idx_dispvente_createdat'],
    ARRAY['DispensaireCertificat',   'createdAt',   'idx_dispcert_createdat'],
    ARRAY['DispensaireRapport',      'createdAt',   'idx_disprapport_createdat'],
    ARRAY['DispensaireSoinFDO',      'createdAt',   'idx_dispfdo_createdat'],
    -- (DispensaireHistorique est une table du RÉPERTOIRE Iron Wolf, pas du site
    --  Dispensaire → voir perf-index-iwc.sql. Rien ici ne l'utilise.)
    ARRAY['DispensaireStockMouvement','createdAt',  'idx_dispstockmvt_createdat'],
    ARRAY['DispensairePointage',     'createdAt',   'idx_disppointage_createdat'],
    ARRAY['DispensaireFacture',      'statut',      'idx_dispfacture_statut'],
    ARRAY['DispensaireFacture',      'dateEcheance','idx_dispfacture_echeance'],
    ARRAY['DispensaireFactureLog',   'factureId',   'idx_dispfacturelog_facture'],
    ARRAY['DispensaireSoinFDO',      'statut',      'idx_dispfdo_statut'],
    ARRAY['DispensaireFrais',        'statut',      'idx_dispfrais_statut'],
    ARRAY['DispensaireStockMouvement','stockId',    'idx_dispstockmvt_stockid'],
    ARRAY['DispensairePointage',     'salarieId',   'idx_disppointage_salarie']
  ];
  d text[];
BEGIN
  FOREACH d SLICE 1 IN ARRAY defs LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = d[1] AND column_name = d[2]
    ) THEN
      EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (%I)', d[3], d[1], d[2]);
    END IF;
  END LOOP;
END $$;
