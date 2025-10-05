-- CreateTable
CREATE TABLE "ChannelReadState" (
    "userId" INTEGER NOT NULL,
    "channelId" INTEGER NOT NULL,
    "lastReadMessageId" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChannelReadState_pkey" PRIMARY KEY ("userId","channelId")
);

-- Indexes
CREATE INDEX "ChannelReadState_channelId_idx" ON "ChannelReadState"("channelId");
CREATE INDEX "ChannelReadState_lastReadMessageId_idx" ON "ChannelReadState"("lastReadMessageId");

-- FKs (defer adding ON DELETE CASCADE to messages to avoid accidental mass deletes; can adjust later)
ALTER TABLE "ChannelReadState" ADD CONSTRAINT "ChannelReadState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChannelReadState" ADD CONSTRAINT "ChannelReadState_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChannelReadState" ADD CONSTRAINT "ChannelReadState_lastReadMessageId_fkey" FOREIGN KEY ("lastReadMessageId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;
