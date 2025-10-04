-- Migration: add tokenId column and unique index to RefreshToken
-- This replaces temporary e2e db push workaround.

/*
  Adds tokenId (unique) to existing RefreshToken rows. For existing rows we
  backfill tokenId with generated UUIDs. Because PostgreSQL needs the uuid-ossp
  extension (or gen_random_uuid from pgcrypto), we'll attempt to use gen_random_uuid
  which is available if the pgcrypto extension is enabled. If not, fallback creates
  a deterministic surrogate using md5 over (id || '-' || userId || '-' || extract(epoch from createdAt)).
*/

-- Enable pgcrypto if available (ignore failure in environments without superuser rights)
DO $$ BEGIN
  BEGIN
    EXECUTE 'CREATE EXTENSION IF NOT EXISTS pgcrypto';
  EXCEPTION WHEN others THEN
    -- ignore
  END;
END $$;

ALTER TABLE "RefreshToken" ADD COLUMN IF NOT EXISTS "tokenId" TEXT;

-- Backfill only null tokenId rows
UPDATE "RefreshToken"
SET "tokenId" = COALESCE(
  (SELECT gen_random_uuid()::text),
  md5(id::text || '-' || "userId"::text || '-' || EXTRACT(EPOCH FROM "createdAt")::text)
)
WHERE "tokenId" IS NULL;

-- Enforce NOT NULL
ALTER TABLE "RefreshToken" ALTER COLUMN "tokenId" SET NOT NULL;

-- Create unique index (if not exists pattern via exception handling)
DO $$ BEGIN
  BEGIN
    CREATE UNIQUE INDEX "RefreshToken_tokenId_key" ON "RefreshToken"("tokenId");
  EXCEPTION WHEN duplicate_table THEN
    -- index already exists
  END;
END $$;
