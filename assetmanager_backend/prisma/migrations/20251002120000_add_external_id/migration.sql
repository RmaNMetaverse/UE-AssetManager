-- Add externalId column to Asset (nullable text)
ALTER TABLE "public"."Asset" ADD COLUMN IF NOT EXISTS "externalId" TEXT;

-- Optional: Create an index for faster lookups if you'll query by externalId often
CREATE INDEX IF NOT EXISTS "Asset_externalId_idx" ON "public"."Asset" ("externalId");
