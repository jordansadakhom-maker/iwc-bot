-- ═══════════════════════════════════════════════════════════════
--  DISPENSAIRE DE SAINT-DENIS — Matières premières & Coffres (entités).
--  Séparé de l'armurerie (tables préfixées « Dispensaire »). Idempotent.
-- ═══════════════════════════════════════════════════════════════

-- Matières premières (module indépendant : fournisseur, seuil, suggestion de commande)
CREATE TABLE IF NOT EXISTS "DispensaireMatiere" (
  "id"          TEXT PRIMARY KEY,
  "nom"         TEXT NOT NULL,
  "quantite"    INTEGER NOT NULL DEFAULT 0,
  "seuil"       INTEGER NOT NULL DEFAULT 0,           -- seuil minimum (0 = pas d'alerte)
  "cible"       INTEGER NOT NULL DEFAULT 0,           -- stock cible (pour la suggestion de commande)
  "unite"       TEXT,
  "fournisseur" TEXT,
  "note"        TEXT,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"   TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedBy"   TEXT
);
ALTER TABLE "DispensaireMatiere" ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS "DispensaireMatiere_nom_idx" ON "DispensaireMatiere" (lower("nom"));

-- Coffres (entités : nom, emplacement, responsable) — référencés par le Stockage
CREATE TABLE IF NOT EXISTS "DispensaireCoffre" (
  "id"           TEXT PRIMARY KEY,
  "nom"          TEXT NOT NULL,
  "emplacement"  TEXT,
  "responsable"  TEXT,
  "note"         TEXT,
  "createdAt"    TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"    TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedBy"    TEXT
);
ALTER TABLE "DispensaireCoffre" ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS "DispensaireCoffre_nom_idx" ON "DispensaireCoffre" (lower("nom"));
