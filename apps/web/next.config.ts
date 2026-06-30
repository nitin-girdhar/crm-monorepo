import type { NextConfig } from 'next';

const config: NextConfig = {
  async rewrites() {
    const apiGateway = process.env['API_GATEWAY_INTERNAL_URL'] ?? 'http://localhost:4000';
    return [
      {
        source: '/api/:path*',
        destination: `${apiGateway}/:path*`,
      },
    ];
  },
};

export default config;
