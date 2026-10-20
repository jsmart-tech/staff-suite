import { Profile } from '@/types';

export const CHANNELS = ['general', 'announcements', 'random', 'hr', 'finance'];

/** Messages fetched per page (newest first). */
export const PAGE_SIZE = 50;

export type MessageStatus = 'sending' | 'sent' | 'failed';

export type RetryPayload = {
  endpoint: string;
  body: Record<string, unknown>;
  clientMessageId: string;
};

export type Message = {
  id: string;
  sender_id: string;
  content: string;
  attachment_url?: string | null;
  attachment_name?: string | null;
  attachment_mime_type?: string | null; // populated for optimistic msgs from File.type
  client_message_id?: string | null;
  created_at: string;
  profiles?: Pick<Profile, 'full_name' | 'avatar_url' | 'role'>;
  // Local-only fields — never sent to / returned from the server
  _status?: MessageStatus;
  _retryPayload?: RetryPayload;
  /** blob: URL shown until the CDN image's onLoad fires, then revoked. */
  _blobUrl?: string | null;
};

export type ActiveChat =
  | { kind: 'channel'; id: string; label: string }
  | { kind: 'direct'; id: string; label: string };

/** Attachment held in composer state while user is composing / file is uploading. */
export type PendingAttachment = {
  /** Server URL once upload completes, blob: URL while uploading */
  url: string;
  name: string;
  mimeType: string;
  /** blob: URL for instant local preview — always set */
  blobUrl: string;
  /** True while the upload XHR is in-flight */
  uploading: boolean;
  /** 0–1 upload progress */
  progress: number;
};

/** Identifies a chat, e.g. "channel:general" or "direct:<user id>". */
export const chatKeyOf = (chat: ActiveChat) => `${chat.kind}:${chat.id}`;

export const byCreatedAt = (a: Message, b: Message) =>
  new Date(a.created_at).getTime() - new Date(b.created_at).getTime();

/** Decide if an attachment should render as an inline image. */
export function isImage(mimeType?: string | null, name?: string | null): boolean {
  if (mimeType) return mimeType.startsWith('image/');
  return /\.(gif|jpe?g|png|webp|avif|svg|heic|heif)$/i.test(name ?? '');
}
