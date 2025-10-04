import { Injectable } from '@nestjs/common';

interface PresenceEntry {
  userId: number;
  username: string;
}

@Injectable()
export class PresenceService {
  // channelId -> Set of userId
  private channelUsers = new Map<number, Map<number, PresenceEntry>>();
  // socketId -> { userId, channels:Set<number> }
  private socketIndex = new Map<string, { userId: number; channels: Set<number> }>();

  join(socketId: string, userId: number, username: string, channelId: number) {
    let users = this.channelUsers.get(channelId);
    if (!users) {
      users = new Map();
      this.channelUsers.set(channelId, users);
    }
    users.set(userId, { userId, username });
    let s = this.socketIndex.get(socketId);
    if (!s) {
      s = { userId, channels: new Set() };
      this.socketIndex.set(socketId, s);
    }
    s.channels.add(channelId);
    return this.list(channelId);
  }

  leaveSocket(socketId: string) {
    const entry = this.socketIndex.get(socketId);
    if (!entry) return [] as { channelId: number; users: PresenceEntry[] }[];
    const affected: { channelId: number; users: PresenceEntry[] }[] = [];
    for (const channelId of entry.channels) {
      const users = this.channelUsers.get(channelId);
      if (users) {
        users.delete(entry.userId);
        if (users.size === 0) this.channelUsers.delete(channelId);
        else affected.push({ channelId, users: Array.from(users.values()) });
      }
    }
    this.socketIndex.delete(socketId);
    return affected;
  }

  list(channelId: number): PresenceEntry[] {
    return Array.from(this.channelUsers.get(channelId)?.values() || []);
  }
}
