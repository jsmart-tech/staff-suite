import type { NextConfig } from 'next';

const supabaseOrigin = process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin : 'https://*.supabase.co';
const cdnOrigin = process.env.NEXT_PUBLIC_CDN_URL ? new URL(process.env.NEXT_PUBLIC_CDN_URL).origin : '';
const isDev = process.env.NODE_ENV !== 'production';

// Where pages may load things from. Next.js needs inline scripts/styles;
// everything else is limited to this site, Supabase (data + realtime), R2
// (direct uploads) and the optional CDN.
const contentSecurityPolicy = [
  `default-src 'self'`,
  `script-src 'self' 'unsafe-inline'${isDev ? ` 'unsafe-eval'` : ''}`,
  `style-src 'self' 'unsafe-inline'`,
  `img-src 'self' data: blob: ${supabaseOrigin} ${cdnOrigin}`.trim(),
  `media-src 'self' blob: ${cdnOrigin}`.trim(),
  `font-src 'self' data:`,
  `connect-src 'self' ${supabaseOrigin} ${supabaseOrigin.replace('https://', 'wss://')} https://*.r2.cloudflarestorage.com ${cdnOrigin}`.trim(),
  `frame-ancestors 'none'`,
  `object-src 'none'`,
  `base-uri 'self'`,
  `form-action 'self'`,
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: contentSecurityPolicy },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // Security headers on every page and API response. (/api/files adds a
        // stricter sandbox policy of its own for uploaded files.)
        source: '/:path*',
        headers: securityHeaders,
      },
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
