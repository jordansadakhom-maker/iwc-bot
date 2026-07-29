-- ═══════════════════════════════════════════════════════════════
--  DISPENSAIRE — Barème des salaires par FONCTION.
--  Additif & idempotent. À exécuter dans le Supabase du DISPENSAIRE.
--
--  La direction fixe un salaire HEBDOMADAIRE (plein, 7 jours) par
--  fonction. Le salaire réel d'un employé est calculé automatiquement :
--      salaire = montantHebdo ÷ 7 × jours travaillés (depuis le pointage).
--  La « fonction » est le grade (texte libre) de DispensaireSalarie.
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS "DispensaireSalaireFonction" (
  "fonction"     TEXT PRIMARY KEY,                     -- = grade du salarié
  "montantHebdo" INTEGER NOT NULL DEFAULT 0,           -- salaire plein pour 7 jours
  "updatedAt"    TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedBy"    TEXT
);
