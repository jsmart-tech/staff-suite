import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // Dashboard responses include user-specific data. Keep them out of
        // shared/CDN caches, but let the browser reuse a response briefly and
        // revalidate it within seconds after a deployment or data change.
        source: '/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'private, max-age=5, stale-while-revalidate=5, must-revalidate',
          },
        ],
      },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
      // CDN domain for R2 — used for chat attachments and profile avatars.
      // Set NEXT_PUBLIC_CDN_URL=https://cdn.yourdomain.com in your .env.local
      // and in Vercel environment variables, then add the hostname below.
      // Example: { protocol: 'https', hostname: 'cdn.blessedpathholdings.com' }
      ...(process.env.NEXT_PUBLIC_CDN_URL
        ? [
            {
              protocol: 'https' as const,
              hostname: new URL(process.env.NEXT_PUBLIC_CDN_URL).hostname,
            },
          ]
        : []),
    ],
  },
  experimental: {
    serverActions: {
      allowedOrigins: ['localhost:3000'],
    },
  },
};

export default nextConfig;
