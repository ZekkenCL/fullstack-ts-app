-- DropForeignKey
ALTER TABLE "Reaction" DROP CONSTRAINT "Reaction_message_fkey";

-- DropForeignKey
ALTER TABLE "Reaction" DROP CONSTRAINT "Reaction_user_fkey";

-- AlterTable
ALTER TABLE "Message" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AddForeignKey
ALTER TABLE "Reaction" ADD CONSTRAINT "Reaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reaction" ADD CONSTRAINT "Reaction_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "Reaction_message_idx" RENAME TO "Reaction_messageId_idx";

-- RenameIndex
ALTER INDEX "Reaction_user_message_emoji_unique" RENAME TO "Reaction_userId_messageId_emoji_key";
