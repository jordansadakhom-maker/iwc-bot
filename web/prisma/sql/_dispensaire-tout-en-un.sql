-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  DISPENSAIRE DE SAINT-DENIS — TOUT-EN-UN (Lots 0 à 3)                        ║
-- ║  À exécuter dans le Supabase du DISPENSAIRE (projet séparé zcoqmc…).         ║
-- ║                                                                             ║
-- ║  Regroupe les 4 scripts de la refonte : socle événementiel (Lot 1),         ║
-- ║  identité patient & dossier médical (Lot 2), workflow de prise en charge    ║
-- ║  (Lot 3), et les index de performance (Lot 0).                              ║
-- ║                                                                             ║
-- ║  100 % ADDITIF & IDEMPOTENT : ne supprime rien, ne modifie aucune donnée    ║
-- ║  existante, rejouable autant de fois que voulu. Copie-colle l'intégralité   ║
-- ║  dans SQL Editor et exécute d'un bloc.                                       ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝


-- ═══════════════════════════════════════════════════════════════════════════
--  1) SOCLE ÉVÉNEMENTIEL (Lot 1) — journal unique + projection d'audit
--     Active « Administration → Journal d'audit ».
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS "DispensaireEvent" (
  "id"           TEXT PRIMARY KEY,
  "aggregate"    TEXT NOT NULL,
  "type"         TEXT NOT NULL,
  "actorId"      TEXT,
  "actorNom"     TEXT,
  "cibleId"      TEXT,
  "cibleLibelle" TEXT,
  "avant"        JSONB,
  "apres"        JSONB,
  "payload"      JSONB,
  "ref"          TEXT,
  "priorite"     INT NOT NULL DEFAULT 0,
  "createdAt"    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "DispensaireEvent_ref_key"    ON "DispensaireEvent"("ref") WHERE "ref" IS NOT NULL;
CREATE INDEX        IF NOT EXISTS "DispensaireEvent_created_idx" ON "DispensaireEvent"("createdAt" DESC);
CREATE INDEX        IF NOT EXISTS "DispensaireEvent_agg_idx"     ON "DispensaireEvent"("aggregate", "createdAt" DESC);
ALTER TABLE "DispensaireEvent" ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS "DispensaireActivityLog" (
  "id"      TEXT PRIMARY KEY,
  "module"  TEXT NOT NULL,
  "action"  TEXT NOT NULL,
  "cible"   TEXT,
  "cibleId" TEXT,
  "avant"   JSONB,
  "apres"   JSONB,
  "par"     TEXT,
  "parId"   TEXT,
  "at"      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "DispensaireActivityLog_at_idx"  ON "DispensaireActivityLog"("at" DESC);
CREATE INDEX IF NOT EXISTS "DispensaireActivityLog_mod_idx" ON "DispensaireActivityLog"("module", "at" DESC);
ALTER TABLE "DispensaireActivityLog" ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS "DispensaireEventDeadLetter" (
  "id"       TEXT PRIMARY KEY,
  "contexte" JSONB,
  "erreur"   TEXT,
  "at"       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS "DispensaireEventCursor" (
  "consumer"    TEXT PRIMARY KEY,
  "lastEventId" TEXT,
  "lastRunAt"   TIMESTAMPTZ
);

CREATE OR REPLACE FUNCTION dispensaire_audit_from_event() RETURNS TRIGGER AS $$
BEGIN
  BEGIN
    INSERT INTO "DispensaireActivityLog"("id","module","action","cible","cibleId","avant","apres","par","parId","at")
    VALUES (gen_random_uuid()::text, NEW."aggregate", NEW."type", NEW."cibleLibelle", NEW."cibleId",
            NEW."avant", NEW."apres", NEW."actorNom", NEW."actorId", NEW."createdAt");
  EXCEPTION WHEN OTHERS THEN
    BEGIN
      INSERT INTO "DispensaireEventDeadLetter"("id","contexte","erreur","at")
      VALUES (gen_random_uuid()::text, to_jsonb(NEW), SQLERRM, now());
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_dispensaire_audit_from_event" ON "DispensaireEvent";
CREATE TRIGGER "trg_dispensaire_audit_from_event" AFTER INSERT ON "DispensaireEvent"
  FOR EACH ROW EXECUTE FUNCTION dispensaire_audit_from_event();


-- ═══════════════════════════════════════════════════════════════════════════
--  2) FONDATION CLINIQUE (Lot 2) — identité patient & dossier médical
--     Active le « Dossier médical » dans Factures → Dossier patient.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS "DispensairePatient" (
  "id"              TEXT PRIMARY KEY,
  "nom"             TEXT NOT NULL,
  "nomNormalise"    TEXT NOT NULL,
  "dateNaissance"   TEXT,
  "telephone"       TEXT,
  "groupeSanguin"   TEXT,
  "allergies"       TEXT,
  "antecedents"     TEXT,
  "traitements"     TEXT,
  "medecinReferent" TEXT,
  "notes"           TEXT,
  "createdAt"       TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"       TIMESTAMPTZ,
  "updatedBy"       TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS "DispensairePatient_norm_key" ON "DispensairePatient"("nomNormalise");
ALTER TABLE "DispensairePatient" ENABLE ROW LEVEL SECURITY;


-- ═══════════════════════════════════════════════════════════════════════════
--  3) WORKFLOW MÉDICAL (Lot 3) — la prise en charge (machine à états)
--     Active l'onglet « Prises en charge ».
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS "DispensairePriseEnCharge" (
  "id"                TEXT PRIMARY KEY,
  "patient"           TEXT NOT NULL,
  "patientNormalise"  TEXT NOT NULL,
  "motif"             TEXT,
  "medecin"           TEXT,
  "etat"              TEXT NOT NULL DEFAULT 'admis',  -- admis | en_soin | termine | annule
  "note"              TEXT,
  "factureId"         TEXT,
  "admisAt"           TIMESTAMPTZ NOT NULL DEFAULT now(),
  "soinAt"            TIMESTAMPTZ,
  "finAt"             TIMESTAMPTZ,
  "createdAt"         TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"         TIMESTAMPTZ,
  "updatedBy"         TEXT
);
CREATE INDEX IF NOT EXISTS "DispPEC_etat_idx"    ON "DispensairePriseEnCharge"("etat", "admisAt" DESC);
CREATE INDEX IF NOT EXISTS "DispPEC_patient_idx" ON "DispensairePriseEnCharge"("patientNormalise");
ALTER TABLE "DispensairePriseEnCharge" ENABLE ROW LEVEL SECURITY;


-- ═══════════════════════════════════════════════════════════════════════════
--  4) INDEX DE PERFORMANCE (Lot 0) — tolérant : chaque index n'est créé que si
--     sa table ET sa colonne existent réellement (les tables absentes sont
--     simplement ignorées). À lancer en dernier.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  defs text[][] := ARRAY[
    ARRAY['DispensaireMembre',        'identifiant', 'idx_dispmembre_identifiant'],
    ARRAY['DispensaireVente',         'createdAt',   'idx_dispvente_createdat'],
    ARRAY['DispensaireCertificat',    'createdAt',   'idx_dispcert_createdat'],
    ARRAY['DispensaireRapport',       'createdAt',   'idx_disprapport_createdat'],
    ARRAY['DispensaireSoinFDO',       'createdAt',   'idx_dispfdo_createdat'],
    ARRAY['DispensaireStockMouvement','createdAt',   'idx_dispstockmvt_createdat'],
    ARRAY['DispensairePointage',      'createdAt',   'idx_disppointage_createdat'],
    ARRAY['DispensaireFacture',       'statut',      'idx_dispfacture_statut'],
    ARRAY['DispensaireFacture',       'dateEcheance','idx_dispfacture_echeance'],
    ARRAY['DispensaireFactureLog',    'factureId',   'idx_dispfacturelog_facture'],
    ARRAY['DispensaireSoinFDO',       'statut',      'idx_dispfdo_statut'],
    ARRAY['DispensaireFrais',         'statut',      'idx_dispfrais_statut'],
    ARRAY['DispensaireStockMouvement','stockId',     'idx_dispstockmvt_stockid'],
    ARRAY['DispensairePointage',      'salarieId',   'idx_disppointage_salarie'],
    ARRAY['DispensaireFacture',       'objet',       'idx_dispfacture_objet'],
    ARRAY['DispensaireVente',         'patient',     'idx_dispvente_patient'],
    ARRAY['DispensaireCertificat',    'patient',     'idx_dispcert_patient'],
    ARRAY['DispensaireRapport',       'patient',     'idx_disprapport_patient']
  ];
  d text[];
BEGIN
  FOREACH d SLICE 1 IN ARRAY defs LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = d[1] AND column_name = d[2]
    ) THEN
      EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (%I)', d[3], d[1], d[2]);
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'DispensairePointage' AND column_name = 'fin'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_disppointage_ouvert ON public."DispensairePointage" (fin) WHERE fin IS NULL';
  END IF;
END $$;

-- ── Fin du tout-en-un. Recharge le site : Journal d'audit, dossier médical et
--    onglet « Prises en charge » sont désormais actifs. ────────────────────────
