// Shared domain types used by backend & frontend

export interface SharedUser {
  id: number;
  username: string;
}

export interface SharedChannel {
  id: number;
  name: string;
  createdAt?: string;
}

export interface SharedMessage {
  id: number;
  channelId: number;
  senderId: number;
  content: string;
  createdAt: string;
  clientMsgId?: string;
}