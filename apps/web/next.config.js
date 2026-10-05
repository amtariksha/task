/** @type {import('next').NextConfig} */
const nextConfig = {
  // App Router is enabled by default in Next.js 16

  // Vercel deployment optimizations
  output: 'standalone',

  // Image optimization for Vercel
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'amtariksha.s3.ap-south-1.amazonaws.com',
        port: '',
        pathname: '/**',
      },
    ],
    unoptimized: false,
  },

  // Turbopack configuration for Next.js 16
  // Turbopack handles Node.js polyfills automatically
  // Empty config acknowledges we want to use Turbopack (default in Next.js 16)
  turbopack: {},

  // Performance optimizations
  experimental: {
    // Disable CSS optimization for now to avoid critters dependency issue
    // optimizeCss: true,
  },

  // Do not add secrets to an `env` block: Next inlines those values into every
  // bundle that references them, client bundles included. Server code reads
  // JWT_SECRET from process.env at runtime.

  // API routes configuration
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-store, max-age=0',
          },
        ],
      },
    ]
  },

  // Webpack configuration
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
      }
    }
    return config
  },
}

module.exports = nextConfig
