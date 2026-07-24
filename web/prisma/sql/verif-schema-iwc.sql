-- ═══════════════════════════════════════════════════════════════════════════
--  VÉRIFICATION DU SCHÉMA — Base IRON WOLF
--  À exécuter dans le Supabase IRON WOLF (SQL Editor → Run).
--  Lecture seule : ne crée/ne modifie RIEN. Liste chaque table & colonne-clé
--  attendue par le code, avec son état. Les « MANQUANT » remontent en tête.
--  NB : les tables cœur (Membre, Coffre…) sont créées par le bot ; les autres
--  proviennent des scripts prisma/sql/*.sql à lancer manuellement.
-- ═══════════════════════════════════════════════════════════════════════════
WITH attendus(objet, tbl, col) AS (VALUES
  -- Cœur / RH / finances
  ('Table · Membre',            'Membre',            ''),
  ('Table · Role',              'Role',              ''),
  ('Table · MembreRole',        'MembreRole',        ''),
  ('Table · Coffre',            'Coffre',            ''),
  ('Table · Transaction',       'Transaction',       ''),
  ('Table · Portefeuille',      'Portefeuille',      ''),
  ('Table · Facture',           'Facture',           ''),
  ('Table · Contrat',           'Contrat',           ''),
  ('Table · Operation',         'Operation',         ''),
  ('Table · Sanction',          'Sanction',          ''),
  ('Table · JournalAudit',      'JournalAudit',      ''),
  ('Table · Notification',      'Notification',      ''),
  ('Table · NotifEtatIWC',      'NotifEtatIWC',      ''),
  -- Renseignement / médical / contacts
  ('Table · Traque',            'Traque',            ''),
  ('Table · RapportInfo',       'RapportInfo',       ''),
  ('Table · RapportTerrain',    'RapportTerrain',    ''),
  ('Table · DossierMedical',    'DossierMedical',    ''),
  ('Table · Contact',           'Contact',           ''),
  ('Table · DemandeContact',    'DemandeContact',    ''),
  -- Clients / rdv / recrutement / télégrammes
  ('Table · Rdv',               'Rdv',               ''),
  ('Table · Candidature',       'Candidature',       ''),
  ('Table · Telegramme',        'Telegramme',        ''),
  ('Table · TelegrammeWeb',     'TelegrammeWeb',     ''),
  ('Table · CommandeWeb',       'CommandeWeb',       ''),
  -- Inventaire / chasse / véhicules / armes / carte
  ('Table · Vehicule',          'Vehicule',          ''),
  ('Table · Arme',              'Arme',              ''),
  ('Table · InventaireItem',    'InventaireItem',    ''),
  ('Table · InventaireMouvement','InventaireMouvement',''),
  ('Table · ChasseZone',        'ChasseZone',        ''),
  ('Table · ChasseStock',       'ChasseStock',       ''),
  ('Table · ChasseMouvement',   'ChasseMouvement',   ''),
  ('Table · CartePoint',        'CartePoint',        ''),
  ('Table · CarteRoute',        'CarteRoute',        ''),
  ('Table · CartePointWeb',     'CartePointWeb',     ''),
  ('Table · CarteRouteWeb',     'CarteRouteWeb',     ''),
  ('Table · CarteConfig',       'CarteConfig',       ''),
  -- Armurerie
  ('Table · ArmurerieClient',          'ArmurerieClient',          ''),
  ('Table · ArmurerieVente',           'ArmurerieVente',           ''),
  ('Table · ArmurerieContrat',         'ArmurerieContrat',         ''),
  ('Table · ArmurerieCommande',        'ArmurerieCommande',        ''),
  ('Table · ArmurerieCoffre',          'ArmurerieCoffre',          ''),
  ('Table · ArmurerieMouvementCoffre', 'ArmurerieMouvementCoffre', ''),
  ('Table · ArmurerieMouvementStock',  'ArmurerieMouvementStock',  ''),
  ('Table · ArmurerieProduit',         'ArmurerieProduit',         ''),
  ('Table · ArmurerieRessource',       'ArmurerieRessource',       ''),
  ('Table · ArmurerieEmploye',         'ArmurerieEmploye',         ''),
  ('Table · ArmureriePointage',        'ArmureriePointage',        ''),
  ('Table · ArmureriePaie',            'ArmureriePaie',            ''),
  ('Table · ArmurerieImpot',           'ArmurerieImpot',           ''),
  ('Table · ArmurerieNote',            'ArmurerieNote',            ''),
  ('Table · ArmurerieTache',           'ArmurerieTache',           ''),
  ('Table · ArmurerieRdv',             'ArmurerieRdv',             ''),
  ('Table · ArmurerieScanRapport',     'ArmurerieScanRapport',     ''),
  -- Colonnes ajoutées par migrations ultérieures (features qui en dépendent)
  ('Colonne · Membre.ficheRH',              'Membre',            'ficheRH'),
  ('Colonne · Membre.absence',              'Membre',            'absence'),
  ('Colonne · DossierMedical.nomRP',        'DossierMedical',    'nomRP'),
  ('Colonne · Contrat.echeance',            'Contrat',           'echeance'),
  ('Colonne · Facture.clientNom',           'Facture',           'clientNom'),
  ('Colonne · ArmurerieVente.prixUnitaire', 'ArmurerieVente',    'prixUnitaire'),
  ('Colonne · ArmurerieVente.ticket',       'ArmurerieVente',    'ticket'),
  ('Colonne · ArmurerieMouvementCoffre.nature','ArmurerieMouvementCoffre','nature')
)
SELECT a.objet AS "objet_attendu",
  CASE
    WHEN a.col = '' THEN CASE WHEN to_regclass('public.'||quote_ident(a.tbl)) IS NULL THEN 'MANQUANT' ELSE 'OK' END
    ELSE CASE WHEN EXISTS (
      SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema='public' AND c.table_name=a.tbl AND c.column_name=a.col
    ) THEN 'OK' ELSE 'MANQUANT' END
  END AS "etat"
FROM attendus a
ORDER BY "etat", a.objet;
