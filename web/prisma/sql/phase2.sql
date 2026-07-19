-- ═══════════════════════════════════════════════════════════════
--  PHASE 2 — Contrats & Opérations complets (à exécuter UNE FOIS dans
--  Supabase → SQL Editor, en fenêtre privée). Additif & idempotent.
-- ═══════════════════════════════════════════════════════════════

-- ── Contrats : pipeline de suivi + montant honoré ──
ALTER TABLE "Contrat" ADD COLUMN IF NOT EXISTS "suivi"             TEXT;
ALTER TABLE "Contrat" ADD COLUMN IF NOT EXISTS "remuVerseAuCoffre" INTEGER;

-- ── Opérations : résultat / butin / débrief (terminaison) ──
ALTER TABLE "Operation" ADD COLUMN IF NOT EXISTS "resultat" TEXT;
ALTER TABLE "Operation" ADD COLUMN IF NOT EXISTS "butin"    TEXT;
ALTER TABLE "Operation" ADD COLUMN IF NOT EXISTS "debrief"  TEXT;
