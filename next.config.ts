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
    ],
  },
  experimental: {
    serverActions: {
      allowedOrigins: ['localhost:3000'],
    },
  },
};

export default nextConfig;
