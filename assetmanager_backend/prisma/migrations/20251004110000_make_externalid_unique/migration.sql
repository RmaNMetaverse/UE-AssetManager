-- Make externalId unique and ensure no duplicates
-- 1) Create a sequence to allocate new externalIds if needed
CREATE SEQUENCE IF NOT EXISTS "external_id_seq" START WITH 1 OWNED BY NONE;

-- 2) Assign unique externalId values to rows where externalId is NULL or 0
WITH need AS (
  SELECT id FROM "public"."Asset" WHERE COALESCE("externalId",0) = 0 ORDER BY id
)
UPDATE "public"."Asset" a
SET "externalId" = nextval('external_id_seq')
FROM need
WHERE a.id = need.id;

-- 3) For any duplicates (rare), reassign using the sequence
-- Create a temporary table of distinct externalId usage counts
CREATE TEMP TABLE dup_ids AS
SELECT "externalId" FROM "public"."Asset" GROUP BY "externalId" HAVING COUNT(*) > 1;

-- For each duplicate group, leave one row and reassign others
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT * FROM dup_ids LOOP
    WITH rows AS (
      SELECT id FROM "public"."Asset" WHERE "externalId" = r."externalId" ORDER BY id
    )
    UPDATE "public"."Asset" a
    SET "externalId" = nextval('external_id_seq')
    FROM (SELECT id FROM rows OFFSET 1) t
    WHERE a.id = t.id;
  END LOOP;
END$$;

DROP TABLE IF EXISTS dup_ids;

-- 4) Now add unique constraint
ALTER TABLE "public"."Asset" ADD CONSTRAINT "Asset_externalId_key" UNIQUE ("externalId");

-- 5) Optionally set sequence to max(externalId)+1
SELECT setval('external_id_seq', COALESCE((SELECT MAX("externalId") FROM "public"."Asset") + 1, 1), false);
