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
    ARRAY['DispensairePointage',     'salarieId',   'idx_disppointage_salarie'],
    -- Colonnes réellement filtrées (audit P3) : identité patient & objet facture.
    ARRAY['DispensaireFacture',      'objet',       'idx_dispfacture_objet'],
    ARRAY['DispensaireVente',        'patient',     'idx_dispvente_patient'],
    ARRAY['DispensaireCertificat',   'patient',     'idx_dispcert_patient'],
    ARRAY['DispensaireRapport',      'patient',     'idx_disprapport_patient']
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

  -- Services EN COURS : l'accueil recharge « fin IS NULL » à chaque page. Un index
  -- PARTIEL (uniquement les lignes ouvertes) est minuscule et évite le balayage
  -- complet de l'historique de pointage qui, lui, grossit sans fin.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'DispensairePointage' AND column_name = 'fin'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_disppointage_ouvert ON public."DispensairePointage" (fin) WHERE fin IS NULL';
  END IF;
END $$;

-- ── Index COMPOSITES (filtre + tri en une passe) ────────────────────────────
--  Chaque index n'est créé que si TOUTES ses colonnes existent (même tolérance).
--  Ils servent les combinaisons réellement demandées par les grosses listes :
--  factures impayées triées par échéance, frais/mouvements listés par date.
DO $$
DECLARE
  comps text[][] := ARRAY[
    -- [ table , liste de colonnes SQL , nom de l'index , colonnes à vérifier (séparées par des virgules) ]
    ARRAY['DispensaireFacture',        '"statut", "dateEcheance"',   'idx_dispfacture_statut_echeance', 'statut,dateEcheance'],
    ARRAY['DispensaireFrais',          '"createdAt" DESC',           'idx_dispfrais_createdat',         'createdAt'],
    ARRAY['DispensaireStockMouvement', '"stockId", "createdAt" DESC','idx_dispstockmvt_item_date',      'stockId,createdAt']
  ];
  c text[];
  ok boolean;
  col text;
BEGIN
  FOREACH c SLICE 1 IN ARRAY comps LOOP
    ok := true;
    FOREACH col IN ARRAY string_to_array(c[4], ',') LOOP
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = c[1] AND column_name = col
      ) THEN ok := false; END IF;
    END LOOP;
    IF ok THEN
      EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (%s)', c[3], c[1], c[2]);
    END IF;
  END LOOP;
END $$;
