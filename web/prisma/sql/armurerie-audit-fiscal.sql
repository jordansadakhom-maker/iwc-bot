-- Journal d'audit fiscal de l'armurerie — traçabilité complète et APPEND-ONLY.
-- Chaque opération fiscale sensible (clôture de cycle, règlement, déclaration,
-- suppression) y écrit une ligne : qui, quand, quelle action, ancienne → nouvelle
-- valeur, et l'adresse IP si disponible. L'application n'y fait JAMAIS d'UPDATE
-- ni de DELETE — c'est un registre en écriture seule.
--
-- À lancer une fois dans Supabase (SQL editor). Sans risque : ne touche à aucune
-- table existante ; si la table n'existe pas encore, le code reste fonctionnel
-- (l'écriture d'audit est best-effort).

CREATE TABLE IF NOT EXISTS "ArmurerieAuditFiscal" (
  "id"        text PRIMARY KEY,
  "action"    text NOT NULL,           -- cloture | reglement | declaration | suppression
  "cible"     text,                    -- ce sur quoi porte l'action (libellé, id…)
  "avant"     text,                    -- ancienne valeur (null si création)
  "apres"     text,                    -- nouvelle valeur (null si suppression)
  "par"       text,                    -- nom de l'auteur
  "ip"        text,                    -- adresse IP (si transmise par l'hébergeur)
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "ArmurerieAuditFiscal_createdAt_idx"
  ON "ArmurerieAuditFiscal" ("createdAt" DESC);

-- Immutabilité STRICTE (optionnel, recommandé) : interdire toute modification /
-- suppression au niveau de la base, même par erreur applicative. À décommenter
-- si tu veux verrouiller le registre côté Postgres (nécessite un rôle non-owner
-- pour l'app ; adapte le nom de rôle si besoin).
--
-- CREATE OR REPLACE RULE "audit_no_update" AS ON UPDATE TO "ArmurerieAuditFiscal" DO INSTEAD NOTHING;
-- CREATE OR REPLACE RULE "audit_no_delete" AS ON DELETE TO "ArmurerieAuditFiscal" DO INSTEAD NOTHING;
