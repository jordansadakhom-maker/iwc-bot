-- ═══════════════════════════════════════════════════════════════════════════
--  CHASSE — Fusion des noms TRONQUÉS (base IRON WOLF)
--  À exécuter dans le Supabase IRON WOLF (SQL Editor → Run).
--
--  Corrige les ressources dupliquées à cause d'un nom coupé lors d'un scan OCR :
--  « Viande de petit g » → « Viande de petit gibier », « Viande de gros gi » →
--  « Viande de gros gibier », etc. Chaque nom court est renommé vers l'UNIQUE
--  nom plus long dont il est le préfixe (sans ambiguïté). Puis les éventuels
--  doublons d'une même charrette sont additionnés en une seule ligne.
--
--  Sûr & rejouable : après une 1re passe, plus rien à fusionner → aucun effet.
--  Ne touche QUE la table ChasseStock. « Viande de gibier » n'est jamais fusionné
--  avec « …gros gibier » (ce ne sont pas les mêmes → garde-fou d'ambiguïté).
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE r RECORD;
BEGIN
  -- 1) Renommer chaque nom court vers le nom complet UNIQUE dont il est le préfixe.
  FOR r IN
    WITH n AS (
      SELECT DISTINCT "nom" AS nom, lower(regexp_replace("nom", '[^a-z0-9]', '', 'gi')) AS k
      FROM "ChasseStock"
    )
    SELECT a.nom AS court,
           (SELECT b.nom FROM n b WHERE b.k <> a.k AND b.k LIKE a.k || '%' ORDER BY length(b.k) DESC LIMIT 1) AS complet
    FROM n a
    WHERE (SELECT count(*) FROM n b WHERE b.k <> a.k AND b.k LIKE a.k || '%') = 1
  LOOP
    IF r.complet IS NOT NULL AND r.complet <> r.court THEN
      UPDATE "ChasseStock" SET "nom" = r.complet WHERE "nom" = r.court;
    END IF;
  END LOOP;

  -- 2) Additionner d'éventuels doublons créés (même charrette + même nom).
  UPDATE "ChasseStock" s SET "quantite" = agg.q
  FROM (SELECT "zoneId", "nom", SUM("quantite") AS q, MIN("id") AS keep
        FROM "ChasseStock" GROUP BY "zoneId", "nom" HAVING COUNT(*) > 1) agg
  WHERE s."id" = agg.keep;

  DELETE FROM "ChasseStock" s
  USING (SELECT "zoneId", "nom", MIN("id") AS keep
         FROM "ChasseStock" GROUP BY "zoneId", "nom" HAVING COUNT(*) > 1) agg
  WHERE s."zoneId" = agg."zoneId" AND s."nom" = agg."nom" AND s."id" <> agg.keep;
END $$;

-- Contrôle : la liste doit désormais montrer les noms COMPLETS, sans doublon.
SELECT "zoneId", "nom", "quantite" FROM "ChasseStock" ORDER BY "nom", "zoneId";
