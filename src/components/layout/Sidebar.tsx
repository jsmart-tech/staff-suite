'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard, Users, CheckSquare, FileText, Settings,
  MessageSquare, DollarSign, Clock, LogOut, Menu, X, Zap,
  ChevronRight, Bell, Search, User,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/lib/store/authStore';
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
  { href: '/dashboard/employee/profile', label: 'My Profile', icon: User, roles: ['employee'] },
  // Shared
  { href: '/dashboard/chat', label: 'Team Chat', icon: MessageSquare, roles: ['admin', 'accountant', 'employee'] },
];

export function Sidebar({ profile }: { profile: Profile }) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const supabase = createClient();

  const filteredNav = navItems.filter(item => item.roles.includes(profile.role));

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  const roleLabel = profile.role.charAt(0).toUpperCase() + profile.role.slice(1);

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className={cn('flex items-center gap-3 px-4 py-5 border-b', 'border-[var(--border)]')}>
        <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: 'linear-gradient(135deg, #7c5bf6, #5b3fd4)' }}>
          <Zap size={18} className="text-white" />
        </div>
        <AnimatePresence>
          {!collapsed && (
            <motion.span
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: 'auto' }}
              exit={{ opacity: 0, width: 0 }}
              className="text-lg font-bold overflow-hidden whitespace-nowrap"
              style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
            >
              Staff<span className="gradient-text">Suite</span>
            </motion.span>
          )}
        </AnimatePresence>
        {/* Collapse toggle (desktop) */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="ml-auto hidden lg:flex w-7 h-7 rounded-lg items-center justify-center transition-colors hover:bg-[var(--bg-hover)]"
          style={{ color: 'var(--text-muted)' }}
        >
          <ChevronRight size={14} className={cn('transition-transform', collapsed ? '' : 'rotate-180')} />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {/* Role section label */}
        {!collapsed && (
          <p className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest"
            style={{ color: 'var(--text-muted)' }}>
            {roleLabel} Portal
          </p>
        )}

        {filteredNav.map((item) => {
          const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
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
              {!collapsed && item.badge ? (
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
          <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold"
            style={{ background: 'linear-gradient(135deg, #7c5bf6, #5b3fd4)', color: 'white' }}>
            {getInitials(profile.full_name)}
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
      {/* Desktop Sidebar */}
      <motion.aside
        animate={{ width: collapsed ? 64 : 240 }}
        transition={{ duration: 0.2, ease: 'easeInOut' }}
        className="hidden lg:flex flex-col h-screen sticky top-0 flex-shrink-0 overflow-hidden"
        style={{ background: 'var(--bg-secondary)', borderRight: '1px solid var(--border)' }}
      >
        <SidebarContent />
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
              <SidebarContent />
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
