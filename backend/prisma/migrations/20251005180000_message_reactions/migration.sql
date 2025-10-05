-- Add createdAt/updatedAt to Message and Reaction table
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE IF NOT EXISTS "Reaction" (
  "id" SERIAL PRIMARY KEY,
  "emoji" TEXT NOT NULL,
  "userId" INTEGER NOT NULL,
  "messageId" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Reaction_user_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Reaction_message_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "Reaction_user_message_emoji_unique" ON "Reaction"("userId","messageId","emoji");
CREATE INDEX IF NOT EXISTS "Reaction_message_idx" ON "Reaction"("messageId");
