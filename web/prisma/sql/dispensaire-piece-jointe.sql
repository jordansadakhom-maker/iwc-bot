-- Pièce jointe « référence visuelle » sur les dossiers médicaux du Dispensaire.
-- Additif et sans risque : ajoute une colonne texte (un lien https vers une image)
-- aux rapports, aux certificats et au dossier médical patient.
-- Le site fonctionne déjà sans (repli automatique) ; lancer ce SQL active l'enregistrement.
ALTER TABLE "DispensaireRapport"    ADD COLUMN IF NOT EXISTS "pieceJointe" TEXT;
ALTER TABLE "DispensaireCertificat" ADD COLUMN IF NOT EXISTS "pieceJointe" TEXT;
ALTER TABLE "DispensairePatient"    ADD COLUMN IF NOT EXISTS "pieceJointe" TEXT;
