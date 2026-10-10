import type { Metadata, Viewport } from 'next';
import { Inter, Plus_Jakarta_Sans } from 'next/font/google';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-plus-jakarta',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Blessed Path Staff Suite — Staff Management & Productivity',
  description:
    'A powerful staff management and productivity platform with real-time collaboration, task tracking, and payroll insights.',
  robots: { index: false, follow: false }, // internal tool — not for search engines
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`dark ${inter.variable} ${plusJakarta.variable}`}
      data-scroll-behavior="smooth"
      suppressHydrationWarning
    >
      <body className="antialiased" suppressHydrationWarning>
        <div className="animated-bg" />
        <div className="relative z-10">{children}</div>
      </body>
    </html>
  );
}
