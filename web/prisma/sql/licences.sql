-- ═══════════════════════════════════════════════════════════════════════════
--  REGISTRE DES LICENCES & AUTORISATIONS — Iron Wolf Company / Armurerie
--  Lot A · Socle du registre officiel
--
--  ⚠️  À exécuter dans le Supabase PRINCIPAL de l'IWC (SQL Editor) — celui du
--      site principal & de l'Armurerie. PAS le Supabase séparé du Dispensaire.
--
--  100 % additif · idempotent (rejouable sans risque) · RLS activée (accès
--  réservé à la clé service_role — le site lit/écrit via cette clé, jamais le
--  navigateur). Aucune donnée existante n'est touchée.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Types de licences (extensible : on ajoute un type = une ligne) ────────
CREATE TABLE IF NOT EXISTS "LicenceType" (
  "code"        TEXT PRIMARY KEY,                    -- ex. 'arme_civile'
  "nom"         TEXT NOT NULL,                        -- libellé affiché
  "description" TEXT,
  "permsDefaut" JSONB   NOT NULL DEFAULT '{}'::jsonb, -- gabarit d'autorisations par défaut
  "prefixe"     TEXT,                                 -- préfixe du n° (ex. 'ARC')
  "actif"       BOOLEAN NOT NULL DEFAULT true,
  "ordre"       INTEGER NOT NULL DEFAULT 0,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"   TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE "LicenceType" ENABLE ROW LEVEL SECURITY;

-- ── 2. Licences (la fiche officielle) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Licence" (
  "id"             TEXT PRIMARY KEY,
  "numero"         TEXT NOT NULL UNIQUE,               -- généré auto (PREFIXE-AAAA-NNNNN-K)
  "typeCode"       TEXT NOT NULL,                       -- ref LicenceType.code
  "nom"            TEXT NOT NULL,
  "prenom"         TEXT,
  "photoUrl"       TEXT,
  "metier"         TEXT,
  "grade"          TEXT,
  "organisation"   TEXT,
  "identifiant"    TEXT,                                -- ID Discord du titulaire (optionnel)
  "dateDelivrance" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "dateExpiration" TIMESTAMPTZ,                         -- null = sans expiration
  "delivrePar"     TEXT,
  "statut"         TEXT NOT NULL DEFAULT 'active',      -- active | suspendue | revoquee | expiree
  "permissions"    JSONB NOT NULL DEFAULT '{}'::jsonb,  -- autorisations effectives (clé -> bool)
  "restrictions"   JSONB NOT NULL DEFAULT '[]'::jsonb,  -- liste de restrictions (clés)
  "commentaires"   TEXT,
  -- Suspension (temporaire)
  "suspensionMotif" TEXT,
  "suspensionDebut" TIMESTAMPTZ,
  "suspensionFin"   TIMESTAMPTZ,                        -- fin auto -> retour 'active'
  "suspensionPar"   TEXT,
  -- Révocation (définitive)
  "revocationMotif" TEXT,
  "revocationAt"    TIMESTAMPTZ,
  "revocationPar"   TEXT,
  "createdAt"       TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"       TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedBy"       TEXT
);
ALTER TABLE "Licence" ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS "Licence_nom_idx"    ON "Licence" (lower("nom"));
CREATE INDEX IF NOT EXISTS "Licence_prenom_idx" ON "Licence" (lower(coalesce("prenom", '')));
CREATE INDEX IF NOT EXISTS "Licence_numero_idx" ON "Licence" (upper("numero"));
CREATE INDEX IF NOT EXISTS "Licence_statut_idx" ON "Licence" ("statut", "dateExpiration");
CREATE INDEX IF NOT EXISTS "Licence_type_idx"   ON "Licence" ("typeCode");
CREATE INDEX IF NOT EXISTS "Licence_ident_idx"  ON "Licence" (lower(coalesce("identifiant", '')));
CREATE INDEX IF NOT EXISTS "Licence_exp_idx"    ON "Licence" ("dateExpiration");

-- ── 3. Historique / journal du registre (append-only, inviolable) ───────────
CREATE TABLE IF NOT EXISTS "LicenceEvent" (
  "id"        TEXT PRIMARY KEY,
  "licenceId" TEXT,                                    -- null = évènement global (recherche…)
  "numero"    TEXT,
  "type"      TEXT NOT NULL,   -- creation|modification|renouvellement|suspension|revocation|reactivation|suppression|recherche|consultation|refus
  "par"       TEXT,
  "details"   JSONB,
  "at"        TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE "LicenceEvent" ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS "LicenceEvent_lic_idx"  ON "LicenceEvent" ("licenceId", "at" DESC);
CREATE INDEX IF NOT EXISTS "LicenceEvent_at_idx"   ON "LicenceEvent" ("at" DESC);
CREATE INDEX IF NOT EXISTS "LicenceEvent_type_idx" ON "LicenceEvent" ("type", "at" DESC);

-- ── 4. Numérotation officielle : séquence + fonction avec clé de contrôle ────
--  Numéro lisible & vérifiable : PREFIXE-ANNÉE-SÉQUENCE-CLÉ (ex. ARC-1904-00042-J).
--  La clé de contrôle détecte une faute de saisie. Le site l'utilise si présente,
--  sinon il génère un numéro équivalent côté serveur (tolérant).
CREATE SEQUENCE IF NOT EXISTS "licence_numero_seq" START 1;

CREATE OR REPLACE FUNCTION "next_licence_numero"(p_prefixe text)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  n     bigint;
  base  text;
  s     int := 0;
  ch    text;
  alpha text := '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
BEGIN
  n := nextval('licence_numero_seq');
  base := upper(coalesce(nullif(trim(p_prefixe), ''), 'LIC'))
          || '-' || to_char(now(), 'YYYY')
          || '-' || lpad(n::text, 5, '0');
  FOREACH ch IN ARRAY regexp_split_to_array(base, '') LOOP
    s := s + ascii(ch);
  END LOOP;
  RETURN base || '-' || substr(alpha, (s % 36) + 1, 1);
END $$;

-- ── 5. Types par défaut (registre prêt à l'emploi — modifiables ensuite) ─────
INSERT INTO "LicenceType" ("code", "nom", "prefixe", "ordre") VALUES
  ('arme_civile',      'Licence d''arme civile',           'ARC', 100),
  ('port_arme',        'Licence de port d''arme',          'PRT',  90),
  ('exercer',          'Autorisation d''exercer',          'EXE',  80),
  ('transport_armes',  'Autorisation de transport d''armes','TRA', 70),
  ('stockage',         'Autorisation de stockage',         'STK',  60),
  ('chasse',           'Licence de chasse',                'CHA',  50),
  ('commerce',         'Licence de commerce',              'COM',  40),
  ('iwc',              'Autorisation IWC',                 'IWC',  30),
  ('securite',         'Accréditation de sécurité',        'SEC',  20),
  ('exceptionnelle',   'Autorisation exceptionnelle',      'EXC',  10)
ON CONFLICT ("code") DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
--  FIN — rejouable à volonté. Prochaine étape (côté site) : onglet « Licences ».
-- ═══════════════════════════════════════════════════════════════════════════
