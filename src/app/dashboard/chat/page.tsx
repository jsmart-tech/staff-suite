'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createClient } from '@/lib/supabase/client';
import { ChatMessage, Profile } from '@/types';
import { getInitials, getRoleBadgeColor } from '@/lib/utils';
import { Send, Hash, Users, Paperclip, Smile, ChevronDown } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

const CHANNELS = ['general', 'announcements', 'random', 'hr', 'finance'];

export default function ChatPage() {
  const [messages, setMessages] = useState<(ChatMessage & { profiles: Pick<Profile, 'full_name' | 'avatar_url' | 'role'> })[]>([]);
  const [content, setContent] = useState('');
  const [channel, setChannel] = useState('general');
  const [userId, setUserId] = useState('');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [onlineCount, setOnlineCount] = useState(1);
  const [sending, setSending] = useState(false);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const supabase = createClient();

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  // Fetch initial data + subscribe to realtime
  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);

      const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).single();
      setProfile(prof as Profile);

      const { data } = await supabase
        .from('chat_messages')
        .select('*, profiles(full_name, avatar_url, role)')
        .eq('channel', channel)
        .order('created_at', { ascending: true })
        .limit(100);
      setMessages(data as typeof messages || []);
      setTimeout(scrollToBottom, 100);
    };
    init();
  }, [channel]);

  // Realtime subscription
  useEffect(() => {
    const sub = supabase
      .channel(`chat:${channel}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'chat_messages',
        filter: `channel=eq.${channel}`,
      }, async (payload) => {
        const { data } = await supabase
          .from('chat_messages')
          .select('*, profiles(full_name, avatar_url, role)')
          .eq('id', payload.new.id)
          .single();
        if (data) {
          setMessages(prev => [...prev, data as typeof messages[0]]);
          setTimeout(scrollToBottom, 50);
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(sub); };
  }, [channel, scrollToBottom]);

  const handleScroll = () => {
    const el = containerRef.current;
    if (!el) return;
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
    setShowScrollBtn(!isNearBottom);
  };

  const handleSend = async () => {
    if (!content.trim() || sending) return;
    setSending(true);
    await supabase.from('chat_messages').insert({
      sender_id: userId,
      content: content.trim(),
      channel,
    });
    setContent('');
    setSending(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Group messages by date
  const groupedMessages = messages.reduce<{ date: string; msgs: typeof messages }[]>((groups, msg) => {
    const date = new Date(msg.created_at).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
    const last = groups[groups.length - 1];
    if (last && last.date === date) { last.msgs.push(msg); }
    else { groups.push({ date, msgs: [msg] }); }
    return groups;
  }, []);

  return (
    <div
      className="flex rounded-2xl overflow-hidden"
      style={{
        height: 'calc(100vh - var(--page-pad-y) * 2)',
        border: '1px solid var(--border)',
        background: 'var(--bg-card)',
      }}
    >

      {/* Channels Sidebar */}
      <div className="w-52 flex-shrink-0 flex flex-col border-r border-[var(--border)]"
        style={{ background: 'var(--bg-secondary)' }}>
        <div className="p-4 border-b border-[var(--border)]">
          <h2 className="font-bold text-sm mb-0.5">Team Chat</h2>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full" style={{ background: 'var(--accent-emerald)' }} />
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{onlineCount} online</span>
          </div>
        </div>

        <div className="p-3">
          <p className="text-[10px] font-bold uppercase tracking-widest px-2 mb-2"
            style={{ color: 'var(--text-muted)' }}>Channels</p>
          <div className="space-y-0.5">
            {CHANNELS.map(ch => (
              <button
                key={ch}
                onClick={() => setChannel(ch)}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all text-left"
                style={{
                  background: channel === ch ? 'rgba(124,91,246,0.15)' : 'transparent',
                  color: channel === ch ? 'white' : 'var(--text-secondary)',
                  fontWeight: channel === ch ? 600 : 400,
                }}
              >
                <Hash size={14} style={{ color: channel === ch ? 'var(--accent-violet)' : 'var(--text-muted)', flexShrink: 0 }} />
                {ch}
              </button>
            ))}
          </div>
        </div>

        {/* Current user */}
        {profile && (
          <div className="mt-auto p-3 border-t border-[var(--border)]">
            <div className="flex items-center gap-2 px-2 py-2 rounded-lg" style={{ background: 'var(--bg-hover)' }}>
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0"
                style={{ background: 'linear-gradient(135deg, #7c5bf6, #5b3fd4)', color: 'white' }}>
                {getInitials(profile.full_name)}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium truncate">{profile.full_name || 'You'}</p>
                <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{profile.role}</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Main Chat */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Channel Header */}
        <div className="flex items-center gap-3 px-5 py-3.5 border-b border-[var(--border)]">
          <Hash size={18} style={{ color: 'var(--accent-violet)' }} />
          <span className="font-semibold">{channel}</span>
          <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--bg-hover)', color: 'var(--text-muted)' }}>
            {messages.length} messages
          </span>
          <div className="ml-auto flex items-center gap-1.5">
            <Users size={14} style={{ color: 'var(--text-muted)' }} />
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Team</span>
          </div>
        </div>

        {/* Messages */}
        <div
          ref={containerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto p-4 space-y-1"
        >
          {groupedMessages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
                style={{ background: 'rgba(124,91,246,0.15)' }}>
                <Hash size={24} style={{ color: 'var(--accent-violet)' }} />
              </div>
              <p className="font-semibold mb-1">Welcome to #{channel}!</p>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                This is the beginning of the #{channel} channel.
              </p>
            </div>
          ) : (
            groupedMessages.map(({ date, msgs }) => (
              <div key={date}>
                {/* Date divider */}
                <div className="flex items-center gap-3 my-4">
                  <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
                  <span className="text-xs px-3 py-1 rounded-full font-medium"
                    style={{ background: 'var(--bg-hover)', color: 'var(--text-muted)' }}>
                    {date}
                  </span>
                  <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
                </div>

                {msgs.map((msg, i) => {
                  const isOwn = msg.sender_id === userId;
                  const prevMsg = i > 0 ? msgs[i - 1] : null;
                  const isGrouped = prevMsg?.sender_id === msg.sender_id;

                  return (
                    <motion.div
                      key={msg.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`flex gap-2.5 ${isOwn ? 'flex-row-reverse' : 'flex-row'} ${isGrouped ? 'mt-0.5' : 'mt-3'}`}
                    >
                      {/* Avatar */}
                      {!isGrouped ? (
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 self-end"
                          style={{ background: isOwn ? 'linear-gradient(135deg, #7c5bf6, #5b3fd4)' : 'linear-gradient(135deg, #38bdf8, #10d98a)', color: 'white' }}>
                          {getInitials(msg.profiles?.full_name)}
                        </div>
                      ) : (
                        <div className="w-8 flex-shrink-0" />
                      )}

                      {/* Bubble */}
                      <div className={`max-w-[70%] ${isOwn ? 'items-end' : 'items-start'} flex flex-col`}>
                        {!isGrouped && (
                          <div className={`flex items-center gap-2 mb-1 ${isOwn ? 'flex-row-reverse' : ''}`}>
                            <span className="text-xs font-semibold">{msg.profiles?.full_name || 'Unknown'}</span>
                            <span className={`badge text-[9px] px-1.5 py-0 ${getRoleBadgeColor(msg.profiles?.role || 'employee')}`}>
                              {msg.profiles?.role}
                            </span>
                            <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                              {formatDistanceToNow(new Date(msg.created_at), { addSuffix: true })}
                            </span>
                          </div>
                        )}
                        <div className={`px-3.5 py-2.5 text-sm leading-relaxed ${isOwn ? 'chat-bubble-own' : 'chat-bubble-other'}`}>
                          {msg.content}
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Scroll to bottom */}
        <AnimatePresence>
          {showScrollBtn && (
            <motion.button
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              onClick={scrollToBottom}
              className="absolute bottom-20 right-8 w-9 h-9 rounded-full flex items-center justify-center shadow-lg"
              style={{ background: 'var(--accent-violet)', color: 'white' }}
            >
              <ChevronDown size={16} />
            </motion.button>
          )}
        </AnimatePresence>

        {/* Input */}
        <div className="p-4 border-t border-[var(--border)]">
          <div className="flex items-end gap-2 rounded-2xl p-2"
            style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)' }}>
            <button className="p-2 rounded-lg transition-colors hover:bg-[var(--bg-card)]"
              style={{ color: 'var(--text-muted)' }}>
              <Paperclip size={16} />
            </button>
            <textarea
              value={content}
              onChange={e => setContent(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={`Message #${channel}...`}
              rows={1}
              className="flex-1 bg-transparent resize-none outline-none text-sm py-1.5 max-h-32"
              style={{ color: 'var(--text-primary)' }}
            />
            <button className="p-2 rounded-lg transition-colors hover:bg-[var(--bg-card)]"
              style={{ color: 'var(--text-muted)' }}>
              <Smile size={16} />
            </button>
            <button
              onClick={handleSend}
              disabled={!content.trim() || sending}
              className="p-2 rounded-xl transition-all"
              style={{
                background: content.trim() ? 'var(--accent-violet)' : 'var(--bg-card)',
                color: content.trim() ? 'white' : 'var(--text-muted)',
              }}
            >
              <Send size={16} />
            </button>
          </div>
          <p className="text-[11px] mt-1.5 ml-2" style={{ color: 'var(--text-muted)' }}>
            Press Enter to send · Shift+Enter for new line
          </p>
        </div>
      </div>
    </div>
  );
}
