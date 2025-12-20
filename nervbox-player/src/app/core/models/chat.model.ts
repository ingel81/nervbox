export type ChatMessageType = 'text' | 'gif' | 'shekel-transaction';

export interface ChatMessage {
  id?: number;
  userId: number;
  username: string;
  message: string;
  messageType?: ChatMessageType;
  gifUrl?: string;
  createdAt: string;
}
