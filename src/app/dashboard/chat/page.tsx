'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { createClient } from '@/lib/supabase/client';
import { Profile } from '@/types';
import { getRoleBadgeColor } from '@/lib/utils';
import { Avatar } from '@/components/ui/Avatar';
import {
  ArrowLeft, Hash, Send, Users,
  Paperclip, X, Image as ImageIcon, Video, FileText, Mic,
  Loader2, CheckCheck, AlertCircle, RotateCcw,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

const CHANNELS = ['general', 'announcements', 'random', 'hr', 'finance'];

type MessageStatus = 'sending' | 'sent' | 'failed';

type Message = {
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
};

type RetryPayload = {
  endpoint: string;
  body: Record<string, unknown>;
  clientMessageId: string;
};

type ActiveChat =
  | { kind: 'channel'; id: string; label: string }
  | { kind: 'direct'; id: string; label: string };

// Attachment held in composer state while user is composing / file is uploading
type PendingAttachment = {
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

// ─── helpers ────────────────────────────────────────────────────────────────

/** Decide if an attachment should render as an inline image. */
function isImage(mimeType?: string | null, name?: string | null): boolean {
  if (mimeType) return mimeType.startsWith('image/');
  return /\.(gif|jpe?g|png|webp|avif|svg|heic|heif)$/i.test(name ?? '');
}

// ─── sub-components ─────────────────────────────────────────────────────────

function ChatBubble({
  message,
  own,
  onRetry,
}: {
  message: Message;
  own: boolean;
  onRetry?: (m: Message) => void;
}) {
  const hasText    = Boolean(message.content?.trim());
  const hasAttach  = Boolean(message.attachment_url);
  const showImage  = hasAttach && isImage(message.attachment_mime_type, message.attachment_name);
  const isPending  = message._status === 'sending';
  const isFailed   = message._status === 'failed';

  return (
    <article className={`flex gap-3 ${own ? 'flex-row-reverse' : ''}`}>
      <Avatar
        src={message.profiles?.avatar_url}
        name={message.profiles?.full_name}
        size={32}
        className="mt-auto"
      />

      <div className={`flex max-w-[82%] flex-col sm:max-w-[72%] ${own ? 'items-end' : 'items-start'}`}>
        {/* Sender name + role + time */}
        <div className="mb-1 flex max-w-full items-center gap-2 text-xs">
          <span className="truncate font-semibold">
            {message.profiles?.full_name || 'Unknown'}
          </span>
          <span className={`badge shrink-0 px-1.5 py-0 text-[9px] ${getRoleBadgeColor(message.profiles?.role || 'employee')}`}>
            {message.profiles?.role}
          </span>
          {!isPending && !isFailed && (
            <span className="hidden text-[var(--text-muted)] sm:inline">
              {formatDistanceToNow(new Date(message.created_at), { addSuffix: true })}
            </span>
          )}
        </div>

        {/* Text bubble */}
        {hasText && (
          <p className={`whitespace-pre-wrap break-words rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
            own ? 'chat-bubble-own' : 'chat-bubble-other'
          } ${isPending ? 'opacity-60' : ''}`}>
            {message.content}
          </p>
        )}

        {/* Attachment */}
        {hasAttach && (
          <a
            href={isFailed || isPending ? undefined : message.attachment_url!}
            target="_blank"
            rel="noreferrer"
            className={`mt-1 block overflow-hidden rounded-xl border border-[var(--border)] ${
              own ? 'bg-[rgba(255,255,255,0.12)]' : 'bg-[var(--bg-hover)]'
            } ${isPending ? 'opacity-60' : ''}`}
          >
            {showImage ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={message.attachment_url!}
                alt={message.attachment_name || 'Attached image'}
                loading="lazy"
                decoding="async"
                className="max-h-64 max-w-[280px] object-contain sm:max-w-xs"
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
              />
            ) : (
              <span className="flex items-center gap-2 px-3 py-2 text-sm">
                <Paperclip size={15} />
                {message.attachment_name || 'Open attachment'}
              </span>
            )}
          </a>
        )}

        {/* Message status row — only shown on own messages */}
        {own && (
          <div className="mt-0.5 flex items-center gap-1 text-[10px] text-[var(--text-muted)]">
            {isPending && (
              <><Loader2 size={10} className="animate-spin" /><span>Sending…</span></>
            )}
            {isFailed && (
              <>
                <AlertCircle size={10} className="text-red-400" />
                <span className="text-red-400">Failed</span>
                {onRetry && (
                  <button
                    type="button"
                    onClick={() => onRetry(message)}
                    className="ml-1 flex items-center gap-0.5 text-[var(--accent-violet)] hover:underline"
                  >
                    <RotateCcw size={9} /> Retry
                  </button>
                )}
              </>
            )}
            {!isPending && !isFailed && (
              <CheckCheck size={11} className="text-[var(--accent-violet)]" />
            )}
          </div>
        )}
      </div>
    </article>
  );
}

// ─── main page ───────────────────────────────────────────────────────────────

export default function ChatPage() {
  const supabase = createClient();
  const [active, setActive] = useState<ActiveChat>({ kind: 'channel', id: 'general', label: 'general' });
  const [profile, setProfile] = useState<Profile | null>(null);
  const [contacts, setContacts] = useState<Pick<Profile, 'id' | 'full_name' | 'email' | 'role' | 'avatar_url'>[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [attachment, setAttachment] = useState<PendingAttachment | null>(null);
  const [attachmentKind, setAttachmentKind] = useState<'photo' | 'document' | 'audio' | 'video'>('photo');
  const [attachmentMenuOpen, setAttachmentMenuOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [unreadScopes, setUnreadScopes] = useState<string[]>([]);
  const [unreadDirectIds, setUnreadDirectIds] = useState<string[]>([]);
  const [mobileChatOpen, setMobileChatOpen] = useState(false);

  const endRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Prevents double-submit on rapid taps / Enter key
  const sendLockRef = useRef(false);
  // Tracks clientMessageIds we have already committed so the Realtime echo is ignored
  const sentClientIdsRef = useRef<Set<string>>(new Set());
  // True when the user has manually scrolled up — suppresses auto-scroll-to-bottom
  const userScrolledUpRef = useRef(false);

  // ── helpers ──────────────────────────────────────────────────────────────

  const markAsRead = useCallback((type: 'channel' | 'direct', id: string) => {
    void fetch('/api/chat/read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, id }),
    });
  }, []);

  const selectChat = (next: ActiveChat) => {
    setActive(next);
    setMobileChatOpen(true);
  };

  const loadUnread = useCallback(async () => {
    const response = await fetch('/api/chat/unread');
    if (response.ok) {
      const result = await response.json();
      setUnreadScopes(result.scopes || []);
      setUnreadDirectIds(result.directUserIds || []);
    }
  }, []);

  const hydrateSenderProfiles = useCallback(async (records: Message[]) => {
    const missingIds = [
      ...new Set(
        records.filter((m) => !m.profiles?.full_name).map((m) => m.sender_id)
      ),
    ];
    if (!missingIds.length) return records;
    const { data: directory } = await supabase
      .from('staff_directory')
      .select('id, full_name, avatar_url, role')
      .in('id', missingIds);
    const profileMap = new Map(
      (directory || []).map((p) => [
        p.id,
        { full_name: p.full_name, avatar_url: p.avatar_url, role: p.role },
      ])
    );
    return records.map((m) =>
      m.profiles?.full_name
        ? m
        : { ...m, profiles: profileMap.get(m.sender_id) || m.profiles }
    );
  }, [supabase]);

  // ── dedup helper — merges server messages with in-flight optimistics ──────
  const mergeMessages = useCallback(
    (server: Message[], previous: Message[]): Message[] => {
      const result = new Map<string, Message>(server.map((m) => [m.id, m]));
      // Keep only pending messages whose clientMessageId hasn't been confirmed
      for (const m of previous) {
        if (!m.id.startsWith('pending-')) continue;
        const alreadyConfirmed = m.client_message_id
          ? sentClientIdsRef.current.has(m.client_message_id)
          : false;
        if (!alreadyConfirmed) result.set(m.id, m);
      }
      return [...result.values()].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
    },
    []
  );

  // ── smart scroll: only snap to bottom when user is already near the bottom ─
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    // Auto-scroll only when within 120 px of the bottom (user hasn't scrolled up)
    if (distanceFromBottom < 120) {
      endRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // ── initial load: profile + contacts ─────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const [{ data: me }, { data: staff }] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', user.id).single(),
        supabase.from('staff_directory').select('id, full_name, email, role, avatar_url').neq('id', user.id).order('full_name'),
      ]);
      setProfile(me as Profile);
      setContacts(staff || []);
    };
    void load();
    void loadUnread();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── poll unread every 5 s ─────────────────────────────────────────────────
  useEffect(() => {
    const timer = window.setInterval(() => void loadUnread(), 5000);
    return () => window.clearInterval(timer);
  }, [loadUnread]);

  // ── hide broken avatar images ─────────────────────────────────────────────
  useEffect(() => {
    const hide = (event: Event) => {
      const t = event.target;
      if (t instanceof HTMLImageElement) t.style.display = 'none';
    };
    window.addEventListener('error', hide, true);
    return () => window.removeEventListener('error', hide, true);
  }, []);

  // ── load messages whenever active chat changes ────────────────────────────
  useEffect(() => {
    if (!profile) return;

    const load = async (reset = false) => {
      setError('');
      // NEVER call setMessages([]) before the fetch completes — it causes a
      // visible blank flash when switching channels. On reset we only clear
      // conversationId (cheap, no visual gap).
      if (reset) setConversationId(null);

      if (active.kind === 'channel') {
        const { data, error: loadError } = await supabase
          .from('chat_messages')
          .select('*, profiles(full_name, avatar_url, role)')
          .eq('channel', active.id)
          .order('created_at')
          .limit(100);
        // Note: client_message_id is included via the * selector
        if (loadError) setError(loadError.message);
        const hydrated = await hydrateSenderProfiles((data || []) as Message[]);
        setMessages((prev) => (reset ? hydrated : mergeMessages(hydrated, prev)));
        if (reset) {
          markAsRead('channel', active.id);
          setUnreadScopes((s) => s.filter((x) => x !== `channel:${active.id}`));
        }
      } else {
        const [member_one, member_two] = [profile.id, active.id].sort();
        const { data: conv, error: loadError } = await supabase
          .from('direct_conversations')
          .select('id')
          .eq('member_one', member_one)
          .eq('member_two', member_two)
          .maybeSingle();
        if (loadError) setError(loadError.message);
        setConversationId(conv?.id || null);
        if (!conv) { setMessages([]); return; }
        const { data } = await supabase
          .from('direct_messages')
          .select('*, profiles(full_name, avatar_url, role)')
          .eq('conversation_id', conv.id)
          .order('created_at')
          .limit(100);
        const hydrated = await hydrateSenderProfiles((data || []) as Message[]);
        setMessages((prev) => (reset ? hydrated : mergeMessages(hydrated, prev)));
        if (reset) {
          markAsRead('direct', conv.id);
          setUnreadDirectIds((ids) => ids.filter((id) => id !== active.id));
        }
      }
    };

    void load(true);
    // 5-second fallback poll — only updates non-pending messages via mergeMessages
    const refresh = window.setInterval(() => void load(), 5000);
    return () => window.clearInterval(refresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, profile]);

  // ── Realtime subscription ─────────────────────────────────────────────────
  useEffect(() => {
    const table = active.kind === 'channel' ? 'chat_messages' : 'direct_messages';
    const filter =
      active.kind === 'channel'
        ? `channel=eq.${active.id}`
        : conversationId
        ? `conversation_id=eq.${conversationId}`
        : undefined;
    if (active.kind === 'direct' && !conversationId) return;

    const channel = supabase
      .channel(`chat-${active.kind}-${active.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table, filter }, async (payload) => {
        const { data } = await supabase
          .from(table)
          .select('*, profiles(full_name, avatar_url, role)')
          .eq('id', payload.new.id)
          .single();
        if (!data) return;
        const [hydrated] = await hydrateSenderProfiles([data as Message]);

        setMessages((prev) => {
          // Skip if we already have this confirmed message
          if (prev.some((m) => m.id === hydrated.id)) return prev;

          // Replace the optimistic placeholder whose clientMessageId matches
          const clientId = (hydrated as Message & { client_message_id?: string }).client_message_id;
          if (clientId) sentClientIdsRef.current.add(clientId);

          const pendingIdx = prev.findIndex(
            (m) =>
              m.id.startsWith('pending-') &&
              m.client_message_id === clientId
          );
          if (pendingIdx !== -1) {
            return prev.map((m, i) => (i === pendingIdx ? hydrated : m));
          }
          return [...prev, hydrated];
        });
        markAsRead(active.kind, active.kind === 'channel' ? active.id : conversationId!);
      })
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [active, conversationId, markAsRead, hydrateSenderProfiles, supabase]);

  // ── send ──────────────────────────────────────────────────────────────────
  /**
   * Extracted so we can call it from both the Send button and the Retry button.
   * `overridePayload` is set when retrying a failed message.
   */
  const dispatchMessage = useCallback(async (
    optimisticId: string,
    clientMessageId: string,
    endpoint: string,
    body: Record<string, unknown>,
  ) => {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).catch(() => null);

    // Network failure
    if (!response) {
      setMessages((prev) => prev.map((m) =>
        m.id === optimisticId
          ? { ...m, _status: 'failed' as MessageStatus, _retryPayload: { endpoint, body, clientMessageId } }
          : m
      ));
      setSending(false);
      sendLockRef.current = false;
      return;
    }

    const result = await response.json().catch(() => ({}));
    setSending(false);

    // Server error
    if (!response.ok) {
      setMessages((prev) => prev.map((m) =>
        m.id === optimisticId
          ? { ...m, _status: 'failed' as MessageStatus, _retryPayload: { endpoint, body, clientMessageId } }
          : m
      ));
      setError(result.error || 'Message could not be sent.');
      sendLockRef.current = false;
      return;
    }

    if (active.kind === 'direct' && result.conversationId) {
      setConversationId(result.conversationId);
    }

    // Mark confirmed so the Realtime echo doesn't add a duplicate
    sentClientIdsRef.current.add(clientMessageId);

    if (result.message) {
      const confirmed: Message = {
        ...result.message,
        _status: 'sent' as MessageStatus,
        profiles: profile
          ? { full_name: profile.full_name, avatar_url: profile.avatar_url, role: profile.role }
          : undefined,
      };
      // Replace the optimistic placeholder IN-PLACE (same sort position, no flicker)
      setMessages((prev) => {
        const idx = prev.findIndex((m) => m.id === optimisticId);
        if (idx !== -1) {
          const next = [...prev];
          next[idx] = confirmed;
          return next;
        }
        // Optimistic was already replaced by Realtime — just deduplicate
        return prev.some((m) => m.id === confirmed.id)
          ? prev
          : [...prev, confirmed].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      });
    }

    sendLockRef.current = false;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, profile]);

  const retryMessage = useCallback((failed: Message) => {
    if (!failed._retryPayload) return;
    const { endpoint, body, clientMessageId } = failed._retryPayload;
    setMessages((prev) => prev.map((m) =>
      m.id === failed.id ? { ...m, _status: 'sending' as MessageStatus } : m
    ));
    setSending(true);
    sendLockRef.current = true;
    setError('');
    void dispatchMessage(failed.id, clientMessageId, endpoint, body);
  }, [dispatchMessage]);

  const send = useCallback(async () => {
    // Bail if already sending OR upload still in-flight
    if (sending || sendLockRef.current || (!content.trim() && !attachment)) return;
    if (attachment?.uploading) {
      setError('Please wait for the file to finish uploading.');
      return;
    }

    const messageContent = content.trim();
    const clientMessageId = crypto.randomUUID();
    const optimisticId    = `pending-${clientMessageId}`;

    // Snapshot attachment values before clearing state
    const snapUrl      = attachment?.url      ?? null;
    const snapName     = attachment?.name     ?? null;
    const snapMimeType = attachment?.mimeType ?? null;

    // ── 1. Update UI instantly — clear composer, show optimistic bubble ──────
    const optimistic: Message = {
      id: optimisticId,
      sender_id: profile?.id || '',
      content: messageContent,
      attachment_url:       snapUrl,
      attachment_name:      snapName,
      attachment_mime_type: snapMimeType,
      client_message_id: clientMessageId,
      created_at: new Date().toISOString(),
      _status: 'sending',
      profiles: profile
        ? { full_name: profile.full_name, avatar_url: profile.avatar_url, role: profile.role }
        : undefined,
    };

    setMessages((prev) => [...prev, optimistic]);
    setContent('');            // ← clears text field immediately
    setAttachment(null);       // ← clears chip immediately (before any await)
    setAttachmentKind('photo');
    setError('');
    sendLockRef.current = true;
    setSending(true);

    // ── 2. Fire API call in background ──────────────────────────────────────
    const endpoint = active.kind === 'channel' ? '/api/chat/messages' : '/api/direct-messages';
    const body: Record<string, unknown> =
      active.kind === 'channel'
        ? { channel: active.id, content: messageContent, attachmentUrl: snapUrl, attachmentName: snapName, attachmentMimeType: snapMimeType, clientMessageId }
        : { recipientId: active.id, content: messageContent, attachmentUrl: snapUrl, attachmentName: snapName, attachmentMimeType: snapMimeType, clientMessageId };

    void dispatchMessage(optimisticId, clientMessageId, endpoint, body);
  }, [sending, content, attachment, profile, active, dispatchMessage]);

  // XHR ref so we can abort in-flight uploads when the chip is dismissed
  const uploadXhrRef = useRef<XMLHttpRequest | null>(null);

  // ── file upload ───────────────────────────────────────────────────────────
  const uploadAttachment = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = ''; // reset immediately so the same file can be re-picked

    if (file.size > 20 * 1024 * 1024) {
      setError('Files over 20 MB must be uploaded to Google Drive, then shared as a link.');
      return;
    }

    // 1. Create blob URL immediately for instant local preview
    const blobUrl = URL.createObjectURL(file);
    // Keep the browser MIME type as a quick hint for the chip/optimistic bubble;
    // the server will overwrite this with the magic-byte-detected value on send.
    const browserMime = file.type || 'application/octet-stream';

    // 2. Show chip immediately
    setAttachment({
      url: blobUrl,   // will be swapped to the server URL after upload
      name: file.name,
      mimeType: browserMime,
      blobUrl,
      uploading: true,
      progress: 0,
    });
    setError('');

    // 3. Upload with XHR for progress events and abort support
    const xhr = new XMLHttpRequest();
    uploadXhrRef.current = xhr;
    const form = new FormData();
    form.append('file', file);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        setAttachment((prev) => prev ? { ...prev, progress: e.loaded / e.total } : null);
      }
    };

    xhr.onload = () => {
      uploadXhrRef.current = null;
      try {
        const result = JSON.parse(xhr.responseText) as { url?: string; name?: string; mimeType?: string; error?: string };
        if (xhr.status === 200 && result.url) {
          // Swap blob URL → server URL.
          // Use the server-detected mimeType (magic bytes) as the authoritative value.
          setAttachment((prev) => prev ? {
            ...prev,
            url: result.url!,
            name: result.name ?? prev.name,
            mimeType: result.mimeType ?? prev.mimeType,
            uploading: false,
            progress: 1,
          } : null);
        } else {
          URL.revokeObjectURL(blobUrl);
          setAttachment(null);
          setError(result.error || 'File upload failed.');
        }
      } catch {
        URL.revokeObjectURL(blobUrl);
        setAttachment(null);
        setError('File upload failed.');
      }
    };

    xhr.onerror = () => {
      uploadXhrRef.current = null;
      URL.revokeObjectURL(blobUrl);
      setAttachment(null);
      setError('File upload failed. Please try again.');
    };

    xhr.open('POST', '/api/chat/upload');
    xhr.send(form);
  }, []);

  const attachmentOptions = [
    { kind: 'photo'    as const, label: 'Photo',    icon: ImageIcon, color: '#60a5fa', accept: 'image/*' },
    { kind: 'video'    as const, label: 'Video',    icon: Video,     color: '#c084fc', accept: 'video/*' },
    { kind: 'document' as const, label: 'Document', icon: FileText,  color: '#fbbf24', accept: '.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,application/pdf' },
    { kind: 'audio'    as const, label: 'Audio',    icon: Mic,       color: '#34d399', accept: 'audio/*' },
  ];

  // ── render ────────────────────────────────────────────────────────────────

  const chatHeader = (
    <header className="flex items-center gap-3 border-b border-[var(--border)] px-4 py-4 sm:px-5">
      <button
        type="button"
        onClick={() => setMobileChatOpen(false)}
        aria-label="Back to conversations"
        className="-ml-1 rounded-lg p-2 text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] md:hidden"
      >
        <ArrowLeft size={18} />
      </button>
      {active.kind === 'channel' ? (
        <Hash size={18} className="shrink-0 text-[var(--accent-violet)]" />
      ) : (
        <Avatar
          src={contacts.find((c) => c.id === active.id)?.avatar_url}
          name={active.label}
          size={30}
          className="shrink-0"
        />
      )}
      <div className="min-w-0">
        <h2 className="truncate font-semibold">{active.label}</h2>
        <p className="truncate text-xs text-[var(--text-muted)]">
          {active.kind === 'channel' ? 'Team channel' : 'Private conversation'}
        </p>
      </div>
      <span className="ml-auto shrink-0 rounded-full bg-[var(--bg-hover)] px-2 py-1 text-xs text-[var(--text-muted)]">
        {messages.filter((m) => !m.id.startsWith('pending-')).length}
      </span>
    </header>
  );

  const messageList = (
    <section
      ref={scrollRef as React.RefObject<HTMLElement>}
      onScroll={() => {
        const el = scrollRef.current;
        if (!el) return;
        const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
        userScrolledUpRef.current = distanceFromBottom > 120;
      }}
      className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-5"
    >
      {messages.length === 0 ? (
        <div className="flex h-full min-h-80 flex-col items-center justify-center text-center">
          <div className="mb-3 rounded-2xl bg-[rgba(124,91,246,0.15)] p-4">
            <Users className="text-[var(--accent-violet)]" />
          </div>
          <p className="font-semibold">Start the conversation</p>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            {active.kind === 'direct'
              ? `Send a private message to ${active.label}.`
              : `Say hello in #${active.label}.`}
          </p>
        </div>
      ) : (
        messages.map((message) => (
          <ChatBubble
            key={message.id}
            message={message}
            own={message.sender_id === profile?.id}
            onRetry={retryMessage}
          />
        ))
      )}
      <div ref={endRef} />
    </section>
  );

  const chatFooter = (
    <footer className="border-t border-[var(--border)] p-3 sm:p-4">
      {error && (
        <p className="mb-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
          {error}
        </p>
      )}
      {attachment && (
        <div className="mb-2 flex items-center gap-2 rounded-lg bg-[var(--bg-hover)] px-3 py-2 text-xs">
          {attachment.uploading
            ? <Loader2 size={13} className="shrink-0 animate-spin text-[var(--accent-violet)]" />
            : <Paperclip size={13} className="shrink-0" />}
          <span className="min-w-0 flex-1 truncate">{attachment.name}</span>
          {attachment.uploading && (
            <span className="shrink-0 tabular-nums text-[var(--text-muted)]">
              {Math.round(attachment.progress * 100)}%
            </span>
          )}
          {/* X button always visible — aborts in-flight XHR if still uploading */}
          <button
            type="button"
            aria-label="Remove attachment"
            onClick={() => {
              if (uploadXhrRef.current) {
                uploadXhrRef.current.abort();
                uploadXhrRef.current = null;
              }
              URL.revokeObjectURL(attachment.blobUrl);
              setAttachment(null);
            }}
            className="ml-auto shrink-0"
          >
            <X size={13} />
          </button>
        </div>
      )}
      <div className="flex items-end gap-2 rounded-2xl border border-[var(--border)] bg-[var(--bg-hover)] p-2">
        {/* Attachment picker */}
        <div className="relative">
          <input
            ref={fileInputRef}
            type="file"
            accept={attachmentOptions.find((o) => o.kind === attachmentKind)?.accept}
            className="hidden"
            onChange={uploadAttachment}
          />
          <button
            type="button"
            onClick={() => setAttachmentMenuOpen((v) => !v)}
            aria-label="Attach file"
            className="rounded-xl p-3 text-[var(--text-secondary)] hover:text-white"
          >
            <Paperclip size={16} />
          </button>
          {attachmentMenuOpen && (
            <div className="absolute bottom-14 left-0 z-20 grid w-52 grid-cols-2 gap-2 rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-3 shadow-2xl">
              {attachmentOptions.map((opt) => (
                <button
                  key={opt.kind}
                  type="button"
                  onClick={() => {
                    setAttachmentKind(opt.kind);
                    setAttachmentMenuOpen(false);
                    window.setTimeout(() => fileInputRef.current?.click(), 0);
                  }}
                  className="flex flex-col items-center gap-1.5 rounded-xl p-3 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
                >
                  <opt.icon size={21} style={{ color: opt.color }} />
                  <span>{opt.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Text input */}
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          placeholder={active.kind === 'channel' ? `Message #${active.label}` : `Message ${active.label}`}
          rows={1}
          className="min-h-10 min-w-0 flex-1 resize-none bg-transparent px-2 py-2 text-sm outline-none"
        />

        {/* Send button — enabled even while uploading; send() will use the
            blob URL as a placeholder and the server URL will be in the DB
            once the upload completes (the chip has already cleared) */}
        <button
          onClick={() => void send()}
          disabled={sending || (!content.trim() && !attachment)}
          aria-label="Send message"
          className="rounded-xl bg-[var(--accent-violet)] p-3 text-white disabled:opacity-50 transition-opacity"
        >
          {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
        </button>
      </div>
      <p className="mt-1.5 px-2 text-[11px] text-[var(--text-muted)]">
        Attach files up to 20 MB &middot; larger files should be shared from Google Drive
      </p>
    </footer>
  );

  const conversationPanel = (
    <main
      className={`${
        mobileChatOpen ? 'fixed inset-0 z-50 flex min-h-[100dvh]' : 'hidden'
      } min-w-0 flex-1 flex-col bg-[var(--bg-card)] md:static md:flex md:min-h-0`}
    >
      {chatHeader}
      {messageList}
      {chatFooter}
    </main>
  );

  const sidebar = (
    <aside
      className={`${
        mobileChatOpen ? 'hidden' : 'flex flex-col'
      } min-h-[620px] w-full border-r border-[var(--border)] bg-[var(--bg-secondary)] md:flex md:flex-col md:w-60`}
    >
      {/* Sticky header */}
      <div className="sticky top-0 z-10 border-b border-[var(--border)] bg-[var(--bg-secondary)] p-5">
        <h1 className="font-bold">Team Chat</h1>
        <p className="mt-1 text-xs text-[var(--text-muted)]">Choose a channel or direct message</p>
      </div>

      {/* Scrollable list */}
      <div className="flex-1 overflow-y-auto">

      {/* Channels */}
      <div className="p-3">
        <p className="mb-2 px-2 text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
          Channels
        </p>
        {CHANNELS.map((ch) => (
          <button
            key={ch}
            onClick={() => selectChat({ kind: 'channel', id: ch, label: ch })}
            className={`flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm ${
              active.kind === 'channel' && active.id === ch
                ? 'bg-[rgba(124,91,246,0.18)] text-white'
                : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
            }`}
          >
            <Hash size={15} />
            {ch}
            {unreadScopes.includes(`channel:${ch}`) && (
              <span className="ml-auto badge px-1.5 py-0 text-[9px]">NEW</span>
            )}
          </button>
        ))}
      </div>

      {/* Direct Messages */}
      <div className="border-t border-[var(--border)] p-3">
        <p className="mb-2 px-2 text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
          Direct messages
        </p>
        {contacts.map((contact) => (
          <button
            key={contact.id}
            onClick={() =>
              selectChat({ kind: 'direct', id: contact.id, label: contact.full_name || contact.email })
            }
            className={`flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm ${
              active.kind === 'direct' && active.id === contact.id
                ? 'bg-[rgba(124,91,246,0.18)] text-white'
                : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
            }`}
          >
            <Avatar src={contact.avatar_url} name={contact.full_name} size={24} />
            <span className="truncate">{contact.full_name || contact.email}</span>
            {unreadDirectIds.includes(contact.id) && (
              <span className="ml-auto badge px-1.5 py-0 text-[9px]">NEW</span>
            )}
          </button>
        ))}
      </div>
      </div>
    </aside>
  );

  return (
    <div className="flex h-[calc(100dvh-theme(spacing.16))] overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] lg:h-[calc(100dvh-theme(spacing.14))]">
      {sidebar}
      {conversationPanel}
    </div>
  );
}
