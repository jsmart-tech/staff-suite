import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'StaffSuite — Staff Management & Productivity',
  description: 'A powerful staff management and productivity platform with real-time collaboration, task tracking, and payroll insights.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" data-scroll-behavior="smooth" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased" suppressHydrationWarning>
        <div className="animated-bg" />
        <div className="relative z-10">
          {children}
        </div>
      </body>
    </html>
  );
}
