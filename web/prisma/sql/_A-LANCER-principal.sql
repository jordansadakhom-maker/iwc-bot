-- ═══════════════════════════════════════════════════════════════════════════
--  IWC — À LANCER « TOUT-EN-UN » · Supabase PRINCIPAL (site + Armurerie)
--  À exécuter UNE FOIS dans le SQL Editor, d'un seul bloc.
--  100 % additif & idempotent : ré-exécutable sans risque, ne casse rien,
--  ne touche aucune donnée existante. Regroupe, dans l'ordre :
--    1) licences.sql              — système de Licences complet
--    2) demandes.sql              — plateforme centrale Demandes (tickets)
--    3) notifications-corbeille.sql — corbeille des notifications (soft-delete)
--  (Chaque section conserve son en-tête d'origine ci-dessous.)
-- ═══════════════════════════════════════════════════════════════════════════


-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │ 1) LICENCES                                                             │
-- └─────────────────────────────────────────────────────────────────────────┘
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

-- ── 6. Réglages du registre (Lot E — intégration Armurerie) ─────────────────
--  Interrupteur du blocage des ventes. Défaut = OFF ('0') : l'Armurerie n'est
--  pas modifiée tant qu'on n'active pas le contrôle depuis l'onglet Licences.
CREATE TABLE IF NOT EXISTS "LicenceConfig" (
  "cle"       TEXT PRIMARY KEY,
  "valeur"    TEXT,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedBy" TEXT
);
ALTER TABLE "LicenceConfig" ENABLE ROW LEVEL SECURITY;
INSERT INTO "LicenceConfig" ("cle", "valeur") VALUES ('bloquer_ventes_armurerie', '0') ON CONFLICT ("cle") DO NOTHING;

-- ── 7. Rôles & accès (Lot G) — attribution de rôles précis par personne ─────
--  Chaque personne (ID Discord) reçoit un rôle qui décide de ses actions. En
--  l'absence de fiche, un repli se base sur les accès IWC (Direction = complet).
CREATE TABLE IF NOT EXISTS "LicenceMembre" (
  "id"          TEXT PRIMARY KEY,
  "identifiant" TEXT,                                  -- ID Discord
  "nom"         TEXT NOT NULL,
  "role"        TEXT NOT NULL DEFAULT 'consultation',  -- admin|direction|responsable|armurier|agent|consultation
  "actif"       BOOLEAN NOT NULL DEFAULT true,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"   TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedBy"   TEXT
);
ALTER TABLE "LicenceMembre" ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS "LicenceMembre_ident_idx" ON "LicenceMembre" (lower(coalesce("identifiant", '')));

-- ── 8. Notifications Discord (bot) — marqueur d'annonce sur le journal ───────
--  Le bot relève les évènements non encore annoncés (annonceAt IS NULL) et les
--  poste dans le salon Discord des licences, puis les marque annoncés.
ALTER TABLE "LicenceEvent" ADD COLUMN IF NOT EXISTS "annonceAt" TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS "LicenceEvent_annonce_idx" ON "LicenceEvent" ("annonceAt") WHERE "annonceAt" IS NULL;

-- ═══════════════════════════════════════════════════════════════════════════
--  FIN — rejouable à volonté. Prochaine étape (côté site) : onglet « Licences ».
-- ═══════════════════════════════════════════════════════════════════════════

-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │ 2) DEMANDES                                                             │
-- └─────────────────────────────────────────────────────────────────────────┘
-- ═══════════════════════════════════════════════════════════════════════════
--  DEMANDES (tickets) — plateforme centrale IWC
--  ⚠️  À exécuter dans le Supabase PRINCIPAL de l'IWC (SQL Editor).
--  100 % additif · idempotent · RLS activée (accès service_role — le site
--  lit/écrit via cette clé). Discord ne sert qu'à notifier (lien profond).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Demande (le dossier) ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Demande" (
  "id"         TEXT PRIMARY KEY,
  "ref"        TEXT NOT NULL UNIQUE,                 -- DEM-AAAA-NNNNN
  "type"       TEXT NOT NULL DEFAULT 'autre',
  "titre"      TEXT NOT NULL,
  "resume"     TEXT,
  "priorite"   TEXT NOT NULL DEFAULT 'normale',      -- critique|elevee|normale|faible
  "statut"     TEXT NOT NULL DEFAULT 'nouvelle',     -- nouvelle|en_attente|en_cours|infos|attente_tiers|terminee|refusee|archivee
  "auteurId"   TEXT,                                 -- ID Discord de l'auteur
  "auteurNom"  TEXT NOT NULL DEFAULT 'Membre',
  "roleCible"  TEXT,                                 -- rôle à notifier (direction/officier/armurier…)
  "assigneId"  TEXT,                                 -- pris en charge par (ID Discord)
  "assigneNom" TEXT,
  "assigneAt"  TIMESTAMPTZ,
  "cibleId"    TEXT,                                 -- lien vers un élément source (opération, facture…)
  "lien"       TEXT,                                 -- deep-link éventuel
  "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"  TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedBy"  TEXT,
  "closedAt"   TIMESTAMPTZ,
  "annonceAt"  TIMESTAMPTZ                            -- marqueur d'annonce Discord (bot)
);
ALTER TABLE "Demande" ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS "Demande_statut_idx"  ON "Demande" ("statut", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "Demande_type_idx"    ON "Demande" ("type");
CREATE INDEX IF NOT EXISTS "Demande_assigne_idx" ON "Demande" (lower(coalesce("assigneId", '')));
CREATE INDEX IF NOT EXISTS "Demande_auteur_idx"  ON "Demande" (lower(coalesce("auteurId", '')));
CREATE INDEX IF NOT EXISTS "Demande_annonce_idx" ON "Demande" ("annonceAt") WHERE "annonceAt" IS NULL;

-- ── 2. Conversation (messages du dossier) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS "DemandeMessage" (
  "id"        TEXT PRIMARY KEY,
  "demandeId" TEXT NOT NULL,
  "auteurId"  TEXT,
  "auteurNom" TEXT NOT NULL DEFAULT 'Membre',
  "corps"     TEXT NOT NULL,
  "pieces"    JSONB NOT NULL DEFAULT '[]'::jsonb,    -- [{nom, url}]
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "editedAt"  TIMESTAMPTZ
);
ALTER TABLE "DemandeMessage" ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS "DemandeMessage_dem_idx" ON "DemandeMessage" ("demandeId", "createdAt");

-- ── 3. Historique (journal du dossier, append-only) ─────────────────────────
CREATE TABLE IF NOT EXISTS "DemandeEvent" (
  "id"        TEXT PRIMARY KEY,
  "demandeId" TEXT NOT NULL,
  "type"      TEXT NOT NULL,   -- creation|statut|prise_en_charge|transfert|message|cloture|reouverture
  "par"       TEXT,
  "details"   JSONB,
  "at"        TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE "DemandeEvent" ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS "DemandeEvent_dem_idx" ON "DemandeEvent" ("demandeId", "at");

-- ── 4. Numérotation lisible : DEM-AAAA-NNNNN ────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS "demande_ref_seq" START 1;
CREATE OR REPLACE FUNCTION "next_demande_ref"()
RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  RETURN 'DEM-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('demande_ref_seq')::text, 5, '0');
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
--  FIN — rejouable à volonté.
-- ═══════════════════════════════════════════════════════════════════════════

-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │ 3) NOTIFICATIONS — CORBEILLE                                            │
-- └─────────────────────────────────────────────────────────────────────────┘
-- ═══════════════════════════════════════════════════════════════════════════
--  CENTRE DE NOTIFICATIONS — Corbeille (soft-delete)
--  ⚠️  À exécuter dans le Supabase PRINCIPAL de l'IWC (SQL Editor).
--  100 % additif · idempotent (rejouable sans risque, aucune donnée touchée).
--
--  Ajoute la colonne "supprime" qui permet la CORBEILLE : une notification
--  supprimée est masquée (mise en corbeille) mais restaurable, au lieu d'être
--  détruite définitivement. Sans cette colonne, le site retombe proprement sur
--  une suppression définitive (le code est tolérant) — mais la corbeille et la
--  restauration ne fonctionnent qu'une fois la colonne présente.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "supprime" BOOLEAN NOT NULL DEFAULT false;

-- Filtre courant : « non supprimées » (le centre exclut la corbeille par défaut).
CREATE INDEX IF NOT EXISTS "Notification_supprime_idx" ON "Notification" ("supprime");
