-- ═══════════════════════════════════════════════════════════════════════════
--  CONVERSATIONS — messagerie interne unifiée (fils de discussion, site-native)
--  Additif & idempotent. À exécuter dans le Supabase PRINCIPAL (IWC).
--
--  Objectif ERP : rapatrier la coordination interne sur le site (le bot Discord
--  ne fait que notifier + rediriger). Un fil = une "Conversation" ; chaque
--  échange = un "Message". "ConversationVue" garde, par membre, la date de
--  dernière lecture (pour les pastilles non-lu).
--
--  Tables NÉES DU SITE : le bot n'en est pas la source de vérité → ajoutées à
--  _JAMAIS_RECONCILIER de supabase-sync (jamais supprimées par la synchro).
--  RLS activée sans policy applicative : le site lit/écrit en service_role.
--  Aucun trigger ici : les notifications sont émises côté action serveur.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS "Conversation" (
  "id"            TEXT PRIMARY KEY,
  "sujet"         TEXT NOT NULL,
  "pole"          TEXT,                             -- iwc / confrerie / null
  "statut"        TEXT NOT NULL DEFAULT 'ouverte',  -- ouverte / archivee
  "creePar"       TEXT,
  "creeParId"     TEXT,
  "lastMessageAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "lastApercu"    TEXT,                             -- aperçu du dernier message
  "lastAuteur"    TEXT,
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "Conversation_tri_idx" ON "Conversation"("statut", "lastMessageAt" DESC);
ALTER TABLE "Conversation" ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS "Message" (
  "id"             TEXT PRIMARY KEY,
  "conversationId" TEXT NOT NULL,
  "auteurId"       TEXT,
  "auteurNom"      TEXT,
  "corps"          TEXT NOT NULL,
  "createdAt"      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "Message_conv_idx" ON "Message"("conversationId", "createdAt");
ALTER TABLE "Message" ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS "ConversationVue" (
  "conversationId" TEXT NOT NULL,
  "membreId"       TEXT NOT NULL,
  "vuAt"           TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY ("conversationId", "membreId")
);
ALTER TABLE "ConversationVue" ENABLE ROW LEVEL SECURITY;
