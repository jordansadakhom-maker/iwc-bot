-- Pièce jointe « référence visuelle » sur les rapports médicaux du Dispensaire.
-- Additif et sans risque : ajoute une colonne texte (un lien https vers une image).
-- Le site fonctionne déjà sans (repli automatique) ; lancer ce SQL active l'enregistrement.
ALTER TABLE "DispensaireRapport" ADD COLUMN IF NOT EXISTS "pieceJointe" TEXT;
