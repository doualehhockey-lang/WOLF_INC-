// frontend/next.config.mjs

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // Proxy API calls to the Wolf Engine backend (avoids CORS in dev).
  async rewrites() {
    return [
      {
        source:      '/api/wolf/:path*',
        destination: `${process.env.WOLF_API_URL ?? 'http://localhost:3000'}/:path*`,
      },
    ];
  },

  // Security headers served by Next.js itself (NGINX adds more in production).
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options',        value: 'DENY' },
          { key: 'X-Content-Type-Options',  value: 'nosniff' },
          { key: 'Referrer-Policy',         value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy',      value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

export default nextConfig;
