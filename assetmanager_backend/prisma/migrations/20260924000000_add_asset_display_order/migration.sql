-- Add an independent, presentation-only order for the default asset grid.
ALTER TABLE "public"."Asset"
ADD COLUMN IF NOT EXISTS "displayOrder" INTEGER NOT NULL DEFAULT 0;

-- Preserve the application's previous default (newest external ID first) as the
-- initial custom order. Future drag/drop edits only change this column.
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY "externalId" DESC, id DESC)::INTEGER AS position
  FROM "public"."Asset"
)
UPDATE "public"."Asset" AS asset
SET "displayOrder" = ranked.position
FROM ranked
WHERE asset.id = ranked.id;

CREATE INDEX IF NOT EXISTS "Asset_displayOrder_idx"
ON "public"."Asset" ("displayOrder", "externalId" DESC);
