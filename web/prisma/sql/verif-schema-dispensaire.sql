-- ═══════════════════════════════════════════════════════════════════════════
--  VÉRIFICATION DU SCHÉMA — Base DISPENSAIRE
--  À exécuter dans le Supabase du DISPENSAIRE (SQL Editor → Run).
--  Lecture seule : ne crée/ne modifie RIEN. Liste chaque table & colonne-clé
--  attendue par le code, avec son état. Les « MANQUANT » remontent en tête.
-- ═══════════════════════════════════════════════════════════════════════════
WITH attendus(objet, tbl, col) AS (VALUES
  -- Tables (col = '')
  ('Table · DispensaireMembre',            'DispensaireMembre',        ''),
  ('Table · DispensaireGrade',             'DispensaireGrade',         ''),
  ('Table · DispensaireConfig',            'DispensaireConfig',        ''),
  ('Table · DispensaireCategorie',         'DispensaireCategorie',     ''),
  ('Table · DispensaireContact',           'DispensaireContact',       ''),
  ('Table · DispensaireHistorique',        'DispensaireHistorique',    ''),
  ('Table · DispensaireStock',             'DispensaireStock',         ''),
  ('Table · DispensaireStockMouvement',    'DispensaireStockMouvement',''),
  ('Table · DispensaireMatiere',           'DispensaireMatiere',       ''),
  ('Table · DispensaireCoffre',            'DispensaireCoffre',        ''),
  ('Table · DispensaireVente',             'DispensaireVente',         ''),
  ('Table · DispensaireFacture',           'DispensaireFacture',       ''),
  ('Table · DispensaireFactureLog',        'DispensaireFactureLog',    ''),
  ('Table · DispensaireSoinFDO',           'DispensaireSoinFDO',       ''),
  ('Table · DispensaireFrais',             'DispensaireFrais',         ''),
  ('Table · DispensaireCertificat',        'DispensaireCertificat',    ''),
  ('Table · DispensaireRapport',           'DispensaireRapport',       ''),
  ('Table · DispensaireDocument',          'DispensaireDocument',      ''),
  ('Table · DispensaireSalarie',           'DispensaireSalarie',       ''),
  ('Table · DispensairePointage',          'DispensairePointage',      ''),
  ('Table · DispensaireConsigne',          'DispensaireConsigne',      ''),
  ('Table · DispensaireConsigneLog',       'DispensaireConsigneLog',   ''),
  ('Table · DispensaireNotifEtat',         'DispensaireNotifEtat',     ''),
  ('Table · DispensaireRapportConfig',     'DispensaireRapportConfig', ''),
  ('Table · DispensaireRapportImpayes',    'DispensaireRapportImpayes',''),
  -- Colonnes ajoutées par migrations ultérieures (features qui en dépendent)
  ('Colonne · DispensaireFacture.dateEcheance', 'DispensaireFacture', 'dateEcheance'),
  ('Colonne · DispensaireFacture.datePaiement', 'DispensaireFacture', 'datePaiement'),
  ('Colonne · DispensaireFacture.payePar',      'DispensaireFacture', 'payePar'),
  ('Colonne · DispensaireContact.relation',     'DispensaireContact', 'relation'),
  ('Colonne · DispensaireStock.stockFixe',      'DispensaireStock',   'stockFixe')
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
