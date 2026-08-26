import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  ...(process.env.DOCKER_BUILD === 'true' ? { output: 'standalone' as const } : {}),
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || '',
  transpilePackages: ['@deska/shared'],
  async rewrites() {
    // Next.js performs this rewrite from inside the web container, so Docker
    // must use the Compose service name instead of the host's localhost.
    // A prebuilt image always talks to the Compose service, never localhost.
    // This keeps Registry-based deployments independent from build-time cache.
    const apiUrl = process.env.DOCKER_BUILD === 'true'
      ? 'http://api:3001'
      : (process.env.API_URL ?? 'http://localhost:3001');
    return [
      {
        source: '/api/:path*',
        destination: `${apiUrl}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
