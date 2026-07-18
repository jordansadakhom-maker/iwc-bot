-- ═══════════════════════════════════════════════════════════════
--  Table « Arme » — registre des armes (section Inventaire du site)
--
--  À exécuter UNE FOIS dans Supabase → SQL Editor. Après ça, le bot
--  synchronise automatiquement ton registre d'armes vers le site.
--  (La RLS est activée : la clé publiable ne peut rien lire ; le site lit via
--   la clé serveur, comme les autres tables.)
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS "Arme" (
  "id"           TEXT PRIMARY KEY,
  "serie"        TEXT NOT NULL,
  "type"         TEXT,
  "categorie"    TEXT,
  "appartenance" TEXT,
  "membreId"     TEXT,
  "membreNom"    TEXT,
  "notes"        TEXT,
  "pole"         "Pole",
  "createdAt"    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE "Arme" ENABLE ROW LEVEL SECURITY;
