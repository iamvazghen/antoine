export type TelegramInboundMessage = {
  /** Telegram update_id of the source update (used for dedupe/logging) */
  updateId: number;
  /** Telegram message_id within the chat */
  messageId: number;
  accountId: string;
  /** Chat id (numeric, stringified) — used for routing and replies */
  chatId: string;
  chatType: 'direct' | 'group';
  /** Human-friendly origin (chat title for groups, sender name for DMs) */
  from: string;
  /** Numeric sender id (stringified) */
  senderId: string;
  senderName?: string;
  /** Sender @username without the leading @ (when present) */
  senderUsername?: string;
  body: string;
  timestamp?: number;
  /** True when the inbound message mentions / replies to this bot (groups). */
  mentionsBot: boolean;
  /** Send a typing indicator to the originating chat. */
  sendTyping: () => Promise<void>;
  /** Reply to the originating chat. */
  reply: (text: string) => Promise<void>;
};

export type TelegramStatus = {
  connected: boolean;
  lastError?: string | null;
};
