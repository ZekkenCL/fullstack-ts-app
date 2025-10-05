-- DropForeignKey
ALTER TABLE "ChannelReadState" DROP CONSTRAINT "ChannelReadState_channelId_fkey";

-- DropForeignKey
ALTER TABLE "ChannelReadState" DROP CONSTRAINT "ChannelReadState_userId_fkey";

-- AlterTable
ALTER TABLE "ChannelReadState" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AddForeignKey
ALTER TABLE "ChannelReadState" ADD CONSTRAINT "ChannelReadState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelReadState" ADD CONSTRAINT "ChannelReadState_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
