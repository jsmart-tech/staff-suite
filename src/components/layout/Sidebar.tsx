'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard, Users, CheckSquare, FileText, Settings,
  MessageSquare, DollarSign, Clock, LogOut, Menu, X, Bell,
  ChevronRight, User,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Profile } from '@/types';
import { cn, getInitials, getRoleBadgeColor } from '@/lib/utils';

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  roles: string[];
  badge?: number;
}

const navItems: NavItem[] = [
  { href: '/dashboard', label: 'Overview', icon: LayoutDashboard, roles: ['admin', 'accountant', 'employee'] },
  // Admin
  { href: '/dashboard/admin/staff', label: 'Staff', icon: Users, roles: ['admin'] },
  { href: '/dashboard/admin/tasks', label: 'All Tasks', icon: CheckSquare, roles: ['admin'] },
  { href: '/dashboard/admin/logs', label: 'Audit Logs', icon: FileText, roles: ['admin'] },
  { href: '/dashboard/admin/settings', label: 'Settings', icon: Settings, roles: ['admin'] },
  // Accountant
  { href: '/dashboard/accountant/payroll', label: 'Payroll', icon: DollarSign, roles: ['accountant'] },
  { href: '/dashboard/accountant/hours', label: 'Hours Report', icon: Clock, roles: ['accountant'] },
  // Employee
  { href: '/dashboard/employee/tasks', label: 'My Tasks', icon: CheckSquare, roles: ['employee'] },
  { href: '/dashboard/employee/profile', label: 'My Profile', icon: User, roles: ['admin', 'accountant', 'employee'] },
  // Shared
  { href: '/dashboard/chat', label: 'Team Chat', icon: MessageSquare, roles: ['admin', 'accountant', 'employee'] },
];

export function Sidebar({ profile }: { profile: Profile }) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [hasNewChat, setHasNewChat] = useState(false);
  const [hasNewTask, setHasNewTask] = useState(false);
  const [notice, setNotice] = useState<{ title: string; body: string; href: string } | null>(null);
  const supabase = createClient();

  const filteredNav = navItems.filter(item => item.roles.includes(profile.role));

  useEffect(() => {
    const chatKey = `staff-suite:chat-seen:${profile.id}`;
    const taskKey = `staff-suite:tasks-seen:${profile.id}`;
    const chatSeenAt = localStorage.getItem(chatKey) ?? new Date().toISOString();
    const taskSeenAt = localStorage.getItem(taskKey) ?? new Date().toISOString();
    if (!localStorage.getItem(chatKey)) localStorage.setItem(chatKey, chatSeenAt);
    if (!localStorage.getItem(taskKey)) localStorage.setItem(taskKey, taskSeenAt);
    const viewingChat = pathname.startsWith('/dashboard/chat');
    const viewingTasks = pathname.startsWith('/dashboard/employee/tasks');

    const checkUnread = async () => {
      const [channelMessages, directMessages, tasks] = await Promise.all([
        supabase.from('chat_messages').select('id').neq('sender_id', profile.id).gt('created_at', chatSeenAt).limit(1),
        supabase.from('direct_messages').select('id').neq('sender_id', profile.id).gt('created_at', chatSeenAt).limit(1),
        profile.role === 'employee'
          ? supabase.from('tasks').select('id').eq('user_id', profile.id).gt('created_at', taskSeenAt).limit(1)
          : Promise.resolve({ data: [] }),
      ]);
      setHasNewChat(!viewingChat && Boolean(channelMessages.data?.length || directMessages.data?.length));
      setHasNewTask(!viewingTasks && Boolean(tasks.data?.length));
    };
    void checkUnread();

    const channel = supabase.channel(`sidebar-notifications-${profile.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, payload => {
        if ((payload.new as { sender_id: string }).sender_id !== profile.id && !window.location.pathname.startsWith('/dashboard/chat')) {
          setHasNewChat(true);
          setNotice({ title: 'New message', body: 'You have a new team chat message.', href: '/dashboard/chat' });
        }
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'direct_messages' }, payload => {
        if ((payload.new as { sender_id: string }).sender_id !== profile.id && !window.location.pathname.startsWith('/dashboard/chat')) {
          setHasNewChat(true);
          setNotice({ title: 'New message', body: 'You received a new direct message.', href: '/dashboard/chat' });
        }
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'tasks', filter: `user_id=eq.${profile.id}` }, () => {
        if (!window.location.pathname.startsWith('/dashboard/employee/tasks')) {
          setHasNewTask(true);
          setNotice({ title: 'New task assigned', body: 'A new task is waiting in your task list.', href: '/dashboard/employee/tasks' });
        }
      })
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [pathname, profile.id, profile.role]);

  useEffect(() => {
    if (pathname.startsWith('/dashboard/chat')) {
      localStorage.setItem(`staff-suite:chat-seen:${profile.id}`, new Date().toISOString());
    }
    if (pathname.startsWith('/dashboard/employee/tasks')) {
      localStorage.setItem(`staff-suite:tasks-seen:${profile.id}`, new Date().toISOString());
    }
  }, [pathname, profile.id]);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(null), 6500);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  const roleLabel = profile.role.charAt(0).toUpperCase() + profile.role.slice(1);

  const renderSidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className={cn('flex items-center gap-3 px-4 py-5 border-b', 'border-[var(--border)]')}>
        <Image src="/babysitting-buddies-logo.png" alt="Babysitting Buddies" width={144} height={96} className="h-12 w-20 object-contain object-left flex-shrink-0" priority />
        <AnimatePresence>
          {!collapsed && (
            <motion.div
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: 'auto' }}
              exit={{ opacity: 0, width: 0 }}
              className="min-w-0 overflow-hidden leading-tight"
              style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
            >
              <span className="block text-base font-bold whitespace-nowrap">Blessed Path</span>
              <span className="gradient-text block text-xs font-bold uppercase tracking-[0.14em] whitespace-nowrap">Staff Portal</span>
            </motion.div>
          )}
        </AnimatePresence>
        {/* Collapse toggle (desktop) */}
        <button
          onClick={() => setCollapsed(true)}
          aria-label="Collapse sidebar"
          className="ml-auto hidden lg:flex w-7 h-7 rounded-lg items-center justify-center transition-colors hover:bg-[var(--bg-hover)]"
          style={{ color: 'var(--text-muted)' }}
        >
          <ChevronRight size={14} className="rotate-180" />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {collapsed && (
          <button
            type="button"
            onClick={() => setCollapsed(false)}
            aria-label="Expand sidebar"
            title="Expand sidebar"
            className="hidden lg:flex mx-auto mb-2 h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-[var(--bg-hover)]"
            style={{ color: 'var(--accent-violet)', border: '1px solid var(--border)' }}
          >
            <ChevronRight size={16} />
          </button>
        )}
        {/* Role section label */}
        {!collapsed && (
          <p className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest"
            style={{ color: 'var(--text-muted)' }}>
            {roleLabel} Portal
          </p>
        )}

        {filteredNav.map((item) => {
          const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
          const isNew = (item.href === '/dashboard/chat' && hasNewChat)
            || (item.href === '/dashboard/employee/tasks' && hasNewTask);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={cn(
                'nav-item flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all',
                isActive
                  ? 'active bg-[rgba(124,91,246,0.12)] text-white'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-white'
              )}
            >
              <item.icon size={18} className="flex-shrink-0" style={{ color: isActive ? 'var(--accent-violet)' : undefined }} />
              <AnimatePresence>
                {!collapsed && (
                  <motion.span
                    initial={{ opacity: 0, width: 0 }}
                    animate={{ opacity: 1, width: 'auto' }}
                    exit={{ opacity: 0, width: 0 }}
                    className="whitespace-nowrap overflow-hidden"
                  >
                    {item.label}
                  </motion.span>
                )}
              </AnimatePresence>
              {!collapsed && isNew ? (
                <span className="ml-auto rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                  style={{ background: 'rgba(16,217,138,0.16)', color: 'var(--accent-emerald)' }}>
                  New
                </span>
              ) : !collapsed && item.badge ? (
                <span className="ml-auto text-xs px-2 py-0.5 rounded-full font-semibold"
                  style={{ background: 'var(--accent-violet)', color: 'white' }}>
                  {item.badge}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      {/* Profile + Sign Out */}
      <div className="p-3 border-t border-[var(--border)]">
        <div className={cn('flex items-center gap-3 px-3 py-2.5 rounded-xl mb-1',
          'bg-[var(--bg-hover)]')}>
          <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden text-xs font-bold"
            style={{ background: 'linear-gradient(135deg, #f1958d, #aff0e2)', color: '#333333' }}>
            {profile.avatar_url ? <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" /> : getInitials(profile.full_name)}
          </div>
          <AnimatePresence>
            {!collapsed && (
              <motion.div
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: 'auto' }}
                exit={{ opacity: 0, width: 0 }}
                className="overflow-hidden"
              >
                <p className="text-sm font-medium truncate max-w-[140px]">{profile.full_name || 'Anonymous'}</p>
                <span className={cn('badge text-[10px]', getRoleBadgeColor(profile.role))}>
                  {roleLabel}
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <button
          onClick={handleSignOut}
          className={cn(
            'flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm font-medium transition-colors',
            'text-[var(--text-secondary)] hover:bg-[rgba(244,63,94,0.1)] hover:text-[#f43f5e]'
          )}
        >
          <LogOut size={16} className="flex-shrink-0" />
          <AnimatePresence>
            {!collapsed && (
              <motion.span
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: 'auto' }}
                exit={{ opacity: 0, width: 0 }}
                className="whitespace-nowrap overflow-hidden"
              >
                Sign Out
              </motion.span>
            )}
          </AnimatePresence>
        </button>
      </div>
    </div>
  );

  return (
    <>
      <AnimatePresence>
        {notice && (
          <motion.div
            initial={{ opacity: 0, y: -16, x: 16 }}
            animate={{ opacity: 1, y: 0, x: 0 }}
            exit={{ opacity: 0, y: -16, x: 16 }}
            className="fixed right-5 top-5 z-[70] w-[min(360px,calc(100vw-2rem))] rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-2xl"
          >
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-[rgba(124,91,246,0.16)] p-2 text-[var(--accent-violet)]"><Bell size={18} /></div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{notice.title}</p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">{notice.body}</p>
                <Link href={notice.href} onClick={() => setNotice(null)} className="mt-3 inline-block text-xs font-semibold text-[var(--accent-violet)]">Open now →</Link>
              </div>
              <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss notification" className="text-[var(--text-muted)] hover:text-white"><X size={15} /></button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Desktop Sidebar */}
      <motion.aside
        animate={{ width: collapsed ? 64 : 240 }}
        transition={{ duration: 0.2, ease: 'easeInOut' }}
        className="hidden lg:flex flex-col h-screen sticky top-0 flex-shrink-0 overflow-hidden"
        style={{ background: 'var(--bg-secondary)', borderRight: '1px solid var(--border)' }}
      >
        {renderSidebarContent()}
      </motion.aside>

      {/* Mobile toggle button */}
      <button
        onClick={() => setMobileOpen(true)}
        className="lg:hidden fixed top-4 left-4 z-50 w-10 h-10 rounded-xl flex items-center justify-center glass-bright"
      >
        <Menu size={18} />
      </button>

      {/* Mobile Sidebar Overlay */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileOpen(false)}
              className="lg:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
            />
            <motion.aside
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="lg:hidden fixed left-0 top-0 bottom-0 z-50 w-64 flex flex-col"
              style={{ background: 'var(--bg-secondary)', borderRight: '1px solid var(--border)' }}
            >
              <button
                onClick={() => setMobileOpen(false)}
                className="absolute top-4 right-4 w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ color: 'var(--text-muted)' }}
              >
                <X size={16} />
              </button>
              {renderSidebarContent()}
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
