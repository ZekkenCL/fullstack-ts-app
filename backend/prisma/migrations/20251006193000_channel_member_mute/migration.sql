-- Add muted + notificationsEnabled columns to ChannelMember
ALTER TABLE "ChannelMember" ADD COLUMN IF NOT EXISTS "muted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ChannelMember" ADD COLUMN IF NOT EXISTS "notificationsEnabled" BOOLEAN NOT NULL DEFAULT true;