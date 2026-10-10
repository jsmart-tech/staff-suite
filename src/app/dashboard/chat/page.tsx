'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { createClient } from '@/lib/supabase/client';
import { Profile } from '@/types';
import { getInitials, getRoleBadgeColor } from '@/lib/utils';
import { Avatar } from '@/components/ui/Avatar';
import {
  ArrowLeft, Hash, MessageCircle, Send, Users,
  Paperclip, X, Image as ImageIcon, Video, FileText, Mic,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

const CHANNELS = ['general', 'announcements', 'random', 'hr', 'finance'];

type Message = {
  id: string;
  sender_id: string;
  content: string;
  attachment_url?: string | null;
  attachment_name?: string | null;
  client_message_id?: string | null;
  created_at: string;
  profiles?: Pick<Profile, 'full_name' | 'avatar_url' | 'role'>;
};

type ActiveChat =
  | { kind: 'channel'; id: string; label: string }
  | { kind: 'direct'; id: string; label: string };

// ─── helpers ────────────────────────────────────────────────────────────────

function isImageUrl(name?: string | null, url?: string | null): boolean {
  const src = name || url || '';
  return /\.(gif|jpe?g|png|webp|svg)$/i.test(src);
}

// ─── sub-components ─────────────────────────────────────────────────────────

function ChatBubble({
  message,
  own,
}: {
  message: Message;
  own: boolean;
}) {
  const hasText = Boolean(message.content?.trim());
  const hasAttachment = Boolean(message.attachment_url);
  const isImg = isImageUrl(message.attachment_name, message.attachment_url);

  return (
    <article className={`flex gap-3 ${own ? 'flex-row-reverse' : ''}`}>
      {/* Avatar */}
      <div className="relative mt-auto flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--accent-violet)] text-[10px] font-bold text-white">
        {message.profiles?.avatar_url ? (
          <Image
            src={message.profiles.avatar_url}
            alt=""
            fill
            sizes="32px"
            className="object-cover"
          />
        ) : (
          getInitials(message.profiles?.full_name)
        )}
      </div>

      {/* Bubble column */}
      <div className={`flex max-w-[82%] flex-col sm:max-w-[72%] ${own ? 'items-end' : 'items-start'}`}>
        {/* Sender name + role + time */}
        <div className="mb-1 flex max-w-full items-center gap-2 text-xs">
          <span className="truncate font-semibold">
            {message.profiles?.full_name || 'Unknown'}
          </span>
          <span className={`badge shrink-0 px-1.5 py-0 text-[9px] ${getRoleBadgeColor(message.profiles?.role || 'employee')}`}>
            {message.profiles?.role}
          </span>
          <span className="hidden text-[var(--text-muted)] sm:inline">
            {formatDistanceToNow(new Date(message.created_at), { addSuffix: true })}
          </span>
        </div>

        {/* Text bubble */}
        {hasText && (
          <p className={`whitespace-pre-wrap break-words rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${own ? 'chat-bubble-own' : 'chat-bubble-other'}`}>
            {message.content}
          </p>
        )}

        {/* Attachment — displayed directly below name/text, like WhatsApp */}
        {hasAttachment && (
          <a
            href={message.attachment_url!}
            target="_blank"
            rel="noreferrer"
            className={`mt-1 block overflow-hidden rounded-xl border border-[var(--border)] ${own ? 'bg-[rgba(255,255,255,0.12)]' : 'bg-[var(--bg-hover)]'}`}
          >
            {isImg ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={message.attachment_url!}
                alt={message.attachment_name || 'Attached image'}
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
  const [attachment, setAttachment] = useState<{ url: string; name: string } | null>(null);
  const [attachmentKind, setAttachmentKind] = useState<'photo' | 'document' | 'audio' | 'video'>('photo');
  const [attachmentMenuOpen, setAttachmentMenuOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [unreadScopes, setUnreadScopes] = useState<string[]>([]);
  const [unreadDirectIds, setUnreadDirectIds] = useState<string[]>([]);
  const [mobileChatOpen, setMobileChatOpen] = useState(false);

  const endRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Prevents double-submit on rapid taps / Enter key
  const sendLockRef = useRef(false);
  // Tracks clientMessageIds we have already committed so the Realtime echo is ignored
  const sentClientIdsRef = useRef<Set<string>>(new Set());

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

  // ── scroll to bottom whenever messages change ─────────────────────────────
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
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
      if (reset) {
        setMessages([]);
        setConversationId(null);
      }

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
  const send = async () => {
    if (sending || sendLockRef.current || (!content.trim() && !attachment)) return;

    const messageContent = content.trim();
    const clientMessageId = crypto.randomUUID();
    const optimisticId = `pending-${clientMessageId}`;

    const optimistic: Message = {
      id: optimisticId,
      sender_id: profile?.id || '',
      content: messageContent,
      attachment_url: attachment?.url ?? null,
      attachment_name: attachment?.name ?? null,
      client_message_id: clientMessageId,
      created_at: new Date().toISOString(),
      profiles: profile
        ? { full_name: profile.full_name, avatar_url: profile.avatar_url, role: profile.role }
        : undefined,
    };

    setMessages((prev) => [...prev, optimistic]);
    setContent('');
    sendLockRef.current = true;
    setSending(true);
    setError('');

    const endpoint =
      active.kind === 'channel' ? '/api/chat/messages' : '/api/direct-messages';
    const body =
      active.kind === 'channel'
        ? {
            channel: active.id,
            content: messageContent,
            attachmentUrl: attachment?.url,
            attachmentName: attachment?.name,
            clientMessageId,
          }
        : {
            recipientId: active.id,
            content: messageContent,
            attachmentUrl: attachment?.url,
            attachmentName: attachment?.name,
            clientMessageId,
          };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).catch(() => null);

    if (!response) {
      setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
      setError('Message could not be sent. Please try again.');
      sendLockRef.current = false;
      setSending(false);
      return;
    }

    const result = await response.json().catch(() => ({}));
    setSending(false);

    if (!response.ok) {
      setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
      setError(result.error || 'Message could not be sent.');
      sendLockRef.current = false;
      return;
    }

    if (active.kind === 'direct' && result.conversationId) {
      setConversationId(result.conversationId);
    }

    // Mark this clientMessageId as confirmed so Realtime echo is handled correctly
    sentClientIdsRef.current.add(clientMessageId);

    if (result.message) {
      const confirmed: Message = {
        ...result.message,
        profiles: profile
          ? { full_name: profile.full_name, avatar_url: profile.avatar_url, role: profile.role }
          : undefined,
      };
      setMessages((prev) =>
        prev
          .filter((m) => m.id !== optimisticId)
          .filter((m) => m.id !== confirmed.id)
          .concat(confirmed)
          .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      );
    }

    setAttachment(null);
    setAttachmentKind('photo');
    sendLockRef.current = false;
  };

  // ── file upload ───────────────────────────────────────────────────────────
  const uploadAttachment = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      setError('Files over 20 MB must be uploaded to Google Drive, then shared as a link.');
      event.target.value = '';
      return;
    }
    const form = new FormData();
    form.append('file', file);
    const response = await fetch('/api/chat/upload', { method: 'POST', body: form });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) setError(result.error || 'File upload failed.');
    else setAttachment({ url: result.url, name: result.name });
    event.target.value = '';
  };

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
        <MessageCircle size={18} className="shrink-0 text-[var(--accent-violet)]" />
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
    <section className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-5">
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
          <Paperclip size={13} />
          <span className="truncate">{attachment.name}</span>
          <button onClick={() => setAttachment(null)} className="ml-auto shrink-0">
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

        {/* Send button */}
        <button
          onClick={() => void send()}
          disabled={sending || (!content.trim() && !attachment)}
          aria-label="Send message"
          className="rounded-xl bg-[var(--accent-violet)] p-3 text-white disabled:opacity-50"
        >
          <Send size={16} />
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
        mobileChatOpen ? 'hidden' : 'block'
      } min-h-[620px] w-full border-r border-[var(--border)] bg-[var(--bg-secondary)] md:block md:w-60`}
    >
      <div className="border-b border-[var(--border)] p-5">
        <h1 className="font-bold">Team Chat</h1>
        <p className="mt-1 text-xs text-[var(--text-muted)]">Choose a channel or direct message</p>
      </div>

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
    </aside>
  );

  return (
    <div className="min-h-[620px] overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] md:flex">
      {sidebar}
      {conversationPanel}
    </div>
  );
}
