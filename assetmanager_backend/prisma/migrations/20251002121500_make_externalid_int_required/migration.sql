-- Convert externalId (TEXT) -> externalId (INT) and make NOT NULL
-- 1) Add a temporary integer column
ALTER TABLE "public"."Asset" ADD COLUMN IF NOT EXISTS "externalId_tmp" INTEGER;

-- 2) Populate integer column from existing text values by extracting digits
--    If a row has no digits, set externalId_tmp to 0 (or choose another default)
UPDATE "public"."Asset"
SET "externalId_tmp" = NULLIF(regexp_replace("externalId"::text, '\D', '', 'g'), '')::integer
WHERE "externalId" IS NOT NULL;

-- For any rows that resulted in NULL, set a default (0)
UPDATE "public"."Asset" SET "externalId_tmp" = 0 WHERE "externalId_tmp" IS NULL;

-- 3) Drop old column and rename tmp to externalId
ALTER TABLE "public"."Asset" DROP COLUMN IF EXISTS "externalId";
ALTER TABLE "public"."Asset" RENAME COLUMN "externalId_tmp" TO "externalId";

-- 4) Ensure NOT NULL constraint
ALTER TABLE "public"."Asset" ALTER COLUMN "externalId" SET NOT NULL;

-- 5) Recreate index
CREATE INDEX IF NOT EXISTS "Asset_externalId_idx" ON "public"."Asset" ("externalId");
