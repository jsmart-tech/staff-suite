'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Profile } from '@/types';
import { getInitials, getRoleBadgeColor } from '@/lib/utils';
import { ArrowLeft, Hash, MessageCircle, Send, Users } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

const CHANNELS = ['general', 'announcements', 'random', 'hr', 'finance'];
type Message = { id: string; sender_id: string; content: string; created_at: string; profiles?: Pick<Profile, 'full_name' | 'avatar_url' | 'role'> };
type ActiveChat = { kind: 'channel'; id: string; label: string } | { kind: 'direct'; id: string; label: string };

export default function ChatPage() {
  const supabase = createClient();
  const [active, setActive] = useState<ActiveChat>({ kind: 'channel', id: 'general', label: 'general' });
  const [profile, setProfile] = useState<Profile | null>(null);
  const [contacts, setContacts] = useState<Pick<Profile, 'id' | 'full_name' | 'email' | 'role' | 'avatar_url'>[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [mobileChatOpen, setMobileChatOpen] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const scrollToBottom = useCallback(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }), []);
  const markAsRead = useCallback((type: 'channel' | 'direct', id: string) => {
    void fetch('/api/chat/read', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type, id }),
    });
  }, []);
  const selectChat = (next: ActiveChat) => { setActive(next); setMobileChatOpen(true); };

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
  }, []);

  useEffect(() => {
    if (!profile) return;
    const load = async (reset = false) => {
      setError('');
      if (reset) { setMessages([]); setConversationId(null); }
      if (active.kind === 'channel') {
        const { data, error: loadError } = await supabase.from('chat_messages').select('*, profiles(full_name, avatar_url, role)').eq('channel', active.id).order('created_at').limit(100);
        if (loadError) setError(loadError.message);
        setMessages((data || []) as Message[]);
        if (reset) markAsRead('channel', active.id);
      } else {
        const [member_one, member_two] = [profile.id, active.id].sort();
        const { data: conversation, error: loadError } = await supabase.from('direct_conversations').select('id').eq('member_one', member_one).eq('member_two', member_two).maybeSingle();
        if (loadError) setError(loadError.message);
        setConversationId(conversation?.id || null);
        if (!conversation) {
          setMessages([]);
          window.setTimeout(scrollToBottom, 0);
          return;
        }
        const { data } = await supabase.from('direct_messages').select('*, profiles(full_name, avatar_url, role)').eq('conversation_id', conversation.id).order('created_at').limit(100);
        setMessages((data || []) as Message[]);
        if (reset) markAsRead('direct', conversation.id);
      }
      window.setTimeout(scrollToBottom, 50);
    };
    void load(true);
    const refresh = window.setInterval(() => { void load(); }, 5000);
    return () => window.clearInterval(refresh);
  }, [active, markAsRead, profile, scrollToBottom]);

  useEffect(() => {
    const table = active.kind === 'channel' ? 'chat_messages' : 'direct_messages';
    const filter = active.kind === 'channel' ? `channel=eq.${active.id}` : conversationId ? `conversation_id=eq.${conversationId}` : undefined;
    if (active.kind === 'direct' && !conversationId) return;
    const channel = supabase.channel(`chat-${active.kind}-${active.id}`).on('postgres_changes', { event: 'INSERT', schema: 'public', table, filter }, async payload => {
      const { data } = await supabase.from(table).select('*, profiles(full_name, avatar_url, role)').eq('id', payload.new.id).single();
      if (data) setMessages(previous => previous.some(message => message.id === data.id) ? previous : [...previous, data as Message]);
      markAsRead(active.kind, active.kind === 'channel' ? active.id : conversationId!);
      window.setTimeout(scrollToBottom, 50);
    }).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [active, conversationId, markAsRead, scrollToBottom]);

  const send = async () => {
    if (!content.trim() || sending) return;
    setSending(true); setError('');
    const endpoint = active.kind === 'channel' ? '/api/chat/messages' : '/api/direct-messages';
    const body = active.kind === 'channel' ? { channel: active.id, content } : { recipientId: active.id, content };
    const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const result = await response.json().catch(() => ({}));
    setSending(false);
    if (!response.ok) { setError(result.error || 'Message could not be sent.'); return; }
    if (active.kind === 'direct' && result.conversationId) setConversationId(result.conversationId);
    if (result.message) {
      const sent = {
        ...result.message,
        profiles: profile ? { full_name: profile.full_name, avatar_url: profile.avatar_url, role: profile.role } : undefined,
      } as Message;
      setMessages(previous => previous.some(message => message.id === sent.id) ? previous : [...previous, sent]);
      window.setTimeout(scrollToBottom, 50);
    }
    setContent('');
  };

  const conversation = <main className={`${mobileChatOpen ? 'fixed inset-0 z-50 flex min-h-[100dvh]' : 'hidden'} min-w-0 flex-1 flex-col bg-[var(--bg-card)] md:static md:flex md:min-h-0`}>
    <header className="flex items-center gap-3 border-b border-[var(--border)] px-4 py-4 sm:px-5"><button type="button" onClick={() => setMobileChatOpen(false)} aria-label="Back to conversations" className="-ml-1 rounded-lg p-2 text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] md:hidden"><ArrowLeft size={18} /></button>{active.kind === 'channel' ? <Hash size={18} className="shrink-0 text-[var(--accent-violet)]" /> : <MessageCircle size={18} className="shrink-0 text-[var(--accent-violet)]" />}<div className="min-w-0"><h2 className="truncate font-semibold">{active.label}</h2><p className="truncate text-xs text-[var(--text-muted)]">{active.kind === 'channel' ? 'Team channel' : 'Private conversation'}</p></div><span className="ml-auto shrink-0 rounded-full bg-[var(--bg-hover)] px-2 py-1 text-xs text-[var(--text-muted)]">{messages.length}</span></header>
    <section className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-5">{messages.length === 0 ? <div className="flex h-full min-h-80 flex-col items-center justify-center text-center"><div className="mb-3 rounded-2xl bg-[rgba(124,91,246,0.15)] p-4"><Users className="text-[var(--accent-violet)]" /></div><p className="font-semibold">Start the conversation</p><p className="mt-1 text-sm text-[var(--text-muted)]">{active.kind === 'direct' ? `Send a private message to ${active.label}.` : `Say hello in #${active.label}.`}</p></div> : messages.map(message => { const own = message.sender_id === profile?.id; return <article key={message.id} className={`flex gap-3 ${own ? 'flex-row-reverse' : ''}`}><div className="mt-auto flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--accent-violet)] text-[10px] font-bold text-white">{message.profiles?.avatar_url ? <img src={message.profiles.avatar_url} alt="" className="h-full w-full object-cover" /> : getInitials(message.profiles?.full_name)}</div><div className={`flex max-w-[82%] flex-col sm:max-w-[72%] ${own ? 'items-end' : 'items-start'}`}><div className="mb-1 flex max-w-full items-center gap-2 text-xs"><span className="truncate font-semibold">{message.profiles?.full_name || 'Unknown'}</span><span className={`badge shrink-0 px-1.5 py-0 text-[9px] ${getRoleBadgeColor(message.profiles?.role || 'employee')}`}>{message.profiles?.role}</span><span className="hidden text-[var(--text-muted)] sm:inline">{formatDistanceToNow(new Date(message.created_at), { addSuffix: true })}</span></div><p className={`whitespace-pre-wrap break-words rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${own ? 'chat-bubble-own' : 'chat-bubble-other'}`}>{message.content}</p></div></article>; })}<div ref={endRef} /></section>
    <footer className="border-t border-[var(--border)] p-3 sm:p-4">{error && <p className="mb-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">{error}</p>}<div className="flex items-end gap-2 rounded-2xl border border-[var(--border)] bg-[var(--bg-hover)] p-2"><textarea value={content} onChange={event => setContent(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send(); } }} placeholder={active.kind === 'channel' ? `Message #${active.label}` : `Message ${active.label}`} rows={1} className="min-h-10 min-w-0 flex-1 resize-none bg-transparent px-2 py-2 text-sm outline-none"/><button onClick={() => void send()} disabled={!content.trim() || sending} aria-label="Send message" className="rounded-xl bg-[var(--accent-violet)] p-3 text-white disabled:opacity-50"><Send size={16} /></button></div><p className="mt-1.5 px-2 text-[11px] text-[var(--text-muted)]">Enter to send · Shift + Enter for a new line</p></footer>
  </main>;

  return <div className="min-h-[620px] overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] md:flex"><aside className={`${mobileChatOpen ? 'hidden' : 'block'} min-h-[620px] w-full border-r border-[var(--border)] bg-[var(--bg-secondary)] md:block md:w-60`}><div className="border-b border-[var(--border)] p-5"><h1 className="font-bold">Team Chat</h1><p className="mt-1 text-xs text-[var(--text-muted)]">Choose a channel or direct message</p></div><div className="p-3"><p className="mb-2 px-2 text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Channels</p>{CHANNELS.map(channel => <button key={channel} onClick={() => selectChat({ kind: 'channel', id: channel, label: channel })} className={`flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm ${active.kind === 'channel' && active.id === channel ? 'bg-[rgba(124,91,246,0.18)] text-white' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'}`}><Hash size={15} />{channel}</button>)}</div><div className="border-t border-[var(--border)] p-3"><p className="mb-2 px-2 text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Direct messages</p>{contacts.map(contact => <button key={contact.id} onClick={() => selectChat({ kind: 'direct', id: contact.id, label: contact.full_name || contact.email })} className={`flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm ${active.kind === 'direct' && active.id === contact.id ? 'bg-[rgba(124,91,246,0.18)] text-white' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'}`}><span className="flex h-6 w-6 items-center justify-center overflow-hidden rounded-full bg-[var(--accent-sky)] text-[10px] font-bold text-white">{contact.avatar_url ? <img src={contact.avatar_url} alt="" className="h-full w-full object-cover" /> : getInitials(contact.full_name)}</span><span className="truncate">{contact.full_name || contact.email}</span></button>)}</div></aside>{conversation}</div>;
}
