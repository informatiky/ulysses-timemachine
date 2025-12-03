import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '1gb',
    },
  },
  // Add this for API routes
  serverRuntimeConfig: {
    maxBodySize: '1gb',
  },
};

export default nextConfig;
