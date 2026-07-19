-- ═══════════════════════════════════════════════════════════════
--  PHASE 1 — Demandes du fondateur (à exécuter UNE FOIS dans Supabase
--  → SQL Editor, en fenêtre privée pour éviter l'auto-traduction Chrome).
--  100 % additif et idempotent (IF NOT EXISTS) : ne dérègle rien.
-- ═══════════════════════════════════════════════════════════════

-- ── Opérations : détail complet au clic ──────────────────────────
ALTER TABLE "Operation" ADD COLUMN IF NOT EXISTS "objectif"    TEXT;
ALTER TABLE "Operation" ADD COLUMN IF NOT EXISTS "lieu"        TEXT;
ALTER TABLE "Operation" ADD COLUMN IF NOT EXISTS "pole"        TEXT;
ALTER TABLE "Operation" ADD COLUMN IF NOT EXISTS "createurNom" TEXT;

-- ── Télégrammes : conversations reçues sur Discord, relayées sur le site ──
CREATE TABLE IF NOT EXISTS "Telegramme" (
  "id"         TEXT PRIMARY KEY,
  "clientId"   TEXT,
  "clientNom"  TEXT,
  "objet"      TEXT,
  "lieu"       TEXT,
  "moment"     TEXT,
  "statut"     TEXT DEFAULT 'ouvert',
  "messages"   JSONB DEFAULT '[]'::jsonb,
  "rdvCree"    BOOLEAN DEFAULT false,
  "salonId"    TEXT,
  "createdAt"  TIMESTAMPTZ DEFAULT now(),
  "updatedAt"  TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE "Telegramme" ENABLE ROW LEVEL SECURITY;

-- ── Inventaire : stock du coffre commun (objets, séparé du registre d'armes) ──
CREATE TABLE IF NOT EXISTS "InventaireItem" (
  "id"         TEXT PRIMARY KEY,
  "categorie"  TEXT DEFAULT 'Commun',
  "nom"        TEXT NOT NULL,
  "quantite"   INTEGER DEFAULT 0,
  "seuil"      INTEGER,
  "updatedAt"  TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE "InventaireItem" ENABLE ROW LEVEL SECURITY;

-- Mouvements de stock (« qui a bougé quoi »)
CREATE TABLE IF NOT EXISTS "InventaireMouvement" (
  "id"         TEXT PRIMARY KEY,
  "texte"      TEXT,
  "par"        TEXT,
  "createdAt"  TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE "InventaireMouvement" ENABLE ROW LEVEL SECURITY;
