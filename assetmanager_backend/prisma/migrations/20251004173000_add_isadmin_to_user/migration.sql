-- Add isAdmin boolean column to User
ALTER TABLE "public"."User" ADD COLUMN IF NOT EXISTS "isAdmin" BOOLEAN NOT NULL DEFAULT false;
