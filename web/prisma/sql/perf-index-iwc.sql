-- ═══════════════════════════════════════════════════════════════════════════
--  PERF — Index de l'IRON WOLF COMPANY (site principal)
--  À exécuter dans le Supabase IRON WOLF (celui alimenté par le bot Discord).
--
--  100 % additif, idempotent & TOLÉRANT : chaque index n'est créé que si sa
--  table ET sa colonne existent réellement dans ta base. Une table absente
--  (module non déployé) est simplement ignorée — le script ne s'arrête jamais
--  en erreur. Rejouable autant de fois que voulu.
--
--  Les clés primaires (id) sont déjà indexées automatiquement : les lookups
--  Membre.id / Coffre.id à chaque requête sont donc déjà rapides. On ajoute ici
--  les colonnes de TRI (createdAt), de FILTRE (statut) et les CLÉS ÉTRANGÈRES
--  des listes et journaux qui grossissent avec le temps.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  defs text[][] := ARRAY[
    -- [ table , colonne , nom de l'index ]
    ARRAY['Transaction',            'createdAt', 'idx_transaction_createdat'],
    ARRAY['Facture',                'createdAt', 'idx_facture_createdat'],
    ARRAY['Contrat',                'statut',    'idx_contrat_statut'],
    ARRAY['Traque',                 'statut',    'idx_traque_statut'],
    ARRAY['RapportTerrain',         'createdAt', 'idx_rapportterrain_createdat'],
    ARRAY['DossierMedical',         'membreId',  'idx_dossier_membreid'],
    ARRAY['Sanction',               'membreId',  'idx_sanction_membreid'],
    ARRAY['Rdv',                    'statut',    'idx_rdv_statut'],
    ARRAY['Rdv',                    'clientId',  'idx_rdv_clientid'],
    ARRAY['Telegramme',             'createdAt', 'idx_telegramme_createdat'],
    ARRAY['Telegramme',             'statut',    'idx_telegramme_statut'],
    ARRAY['Candidature',            'createdAt', 'idx_candidature_createdat'],
    ARRAY['Candidature',            'statut',    'idx_candidature_statut'],
    ARRAY['ChasseMouvement',        'createdAt', 'idx_chassemvt_createdat'],
    ARRAY['ChasseMouvement',        'zoneId',    'idx_chassemvt_zoneid'],
    ARRAY['InventaireMouvement',    'createdAt', 'idx_invmvt_createdat'],
    ARRAY['ArmurerieVente',         'createdAt', 'idx_armvente_createdat'],
    ARRAY['ArmurerieVente',         'clientId',  'idx_armvente_clientid'],
    ARRAY['ArmurerieVente',         'ticket',    'idx_armvente_ticket'],
    ARRAY['ArmurerieMouvementCoffre','createdAt','idx_armmvtcoffre_createdat'],
    ARRAY['ArmurerieMouvementStock','createdAt', 'idx_armmvtstock_createdat'],
    ARRAY['ArmurerieMouvementStock','refId',     'idx_armmvtstock_refid'],
    ARRAY['ArmureriePaie',          'employeId', 'idx_armpaie_employeid'],
    ARRAY['ArmureriePointage',      'employeId', 'idx_armpointage_employeid'],
    ARRAY['ArmurerieImpot',         'statut',    'idx_armimpot_statut'],
    -- Répertoire des partenaires (côté Iron Wolf) + son journal de modifications
    ARRAY['DispensaireHistorique',  'createdAt', 'idx_disphisto_createdat'],
    ARRAY['DispensaireHistorique',  'contactId', 'idx_disphisto_contactid'],
    ARRAY['DispensaireContact',     'categorieId','idx_dispcontact_categorie']
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
