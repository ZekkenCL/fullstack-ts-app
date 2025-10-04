# Backend Notes

## Channel Membership

Added `ChannelMember` join table (composite PK userId+channelId) with a `role` field. After pulling latest changes run:

```
pnpm --filter fullstack-ts-app-backend prisma:migrate
```

Seed assigns the seeded user as `owner` of the `general` channel. Creating a channel while authenticated auto-creates an `owner` membership for the creator. Join a channel: `POST /channels/:id/join` (Bearer token required). Leave a channel: `POST /channels/:id/leave`.

HTTP message creation and listing now require membership; WebSocket joinChannel and sendMessage events enforce membership.
