'use client';

import { usePathname } from 'next/navigation';

export function DashboardMain({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isTeamChat = pathname.startsWith('/dashboard/chat');

  return (
    <div className={`main-area${isTeamChat ? ' dashboard-chat-main' : ''}`}>
      {isTeamChat ? (
        children
      ) : (
        <div className="page-container pt-16 sm:pt-7 lg:pt-8">{children}</div>
      )}
    </div>
  );
}
