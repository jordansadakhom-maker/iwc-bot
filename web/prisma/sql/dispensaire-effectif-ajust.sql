-- ═══════════════════════════════════════════════════════════════
--  DISPENSAIRE — Ajustement manuel des HEURES D'EFFECTIF.
--  Additif & idempotent. À exécuter dans le Supabase du DISPENSAIRE.
--
--  Permet à la Direction / RH de corriger les heures d'effectif d'un
--  salarié (oubli de déconnexion → trop d'heures, oubli de prise de
--  service → trop peu, erreur de pointage) SANS toucher au pointage brut.
--
--  ⚠ N'A AUCUN IMPACT SUR LES SALAIRES : le salaire dépend des JOURS, pas
--  des heures. Cet ajustement ne corrige que les statistiques de présence,
--  les heures d'effectif et les classements. Chaque changement est tracé
--  dans le journal d'audit (événement pointage.heures_ajust).
--
--  `deltaMin` = ajustement CUMULÉ en minutes (signé) pour la semaine.
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS "DispensaireEffectifAjust" (
  "id"            TEXT PRIMARY KEY,
  "semaineLundi"  TEXT NOT NULL,                         -- lundi de la semaine (YYYY-MM-DD)
  "nomKey"        TEXT NOT NULL,                         -- nom normalisé (clé de rapprochement)
  "nom"           TEXT NOT NULL,                         -- nom affiché
  "deltaMin"      INTEGER NOT NULL DEFAULT 0,            -- ajustement cumulé (minutes, signé)
  "updatedAt"     TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedBy"     TEXT,
  UNIQUE ("semaineLundi", "nomKey")
);
ALTER TABLE "DispensaireEffectifAjust" ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS "idx_disp_effectif_ajust_sem" ON "DispensaireEffectifAjust"("semaineLundi");
